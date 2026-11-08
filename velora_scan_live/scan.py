"""Velora: auditoria de tecnologia de aquisição em HTML e rede (não invasiva).
Não envia formulários, não aceita consentimento e não deduz ausência de ferramenta.
"""
import argparse, asyncio, csv, datetime, ipaddress, json, re, socket
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.robotparser import RobotFileParser
from playwright.async_api import async_playwright

UA = "VeloraAcquisitionResearch/0.3 (public, no forms submitted)"
SIG = {
 "GTM":[r"googletagmanager\.com/gtm\.js",r"\bGTM-[A-Z0-9]{5,}\b"],
 "GA4":[r"google-analytics\.com/g/collect",r"gtag/js\?id=G-",r"\bG-[A-Z0-9]{7,}\b"],
 "Meta Pixel":[r"connect\.facebook\.net/.*/fbevents\.js",r"facebook\.com/tr(?:[?/]|$)",r"fbq\("],
 "LinkedIn Insight":[r"snap\.licdn\.com/li\.lms-analytics",r"px\.ads\.linkedin\.com/collect",r"_linkedin_partner_id"],
 "Google Ads":[r"googleadservices\.com/pagead",r"googleads\.g\.doubleclick\.net/pagead",r"\bAW-\d+\b"],
 "HubSpot web":[r"js\.hsforms\.net",r"forms\.hsforms\.com",r"js\.hs-scripts\.com",r"hbspt\.forms"],
 "RD Station web":[r"rdstation\.com\.br",r"rd\.services",r"d335luupugsy2\.cloudfront\.net"],
 "Ploomes web":[r"ploomes\.com",r"forms\.ploomes\.com"],
 "Bitrix24 web":[r"bitrix24",r"b24\.form"],
 "Salesforce web":[r"webto\.salesforce\.com",r"pardot\.com",r"pi\.pardot\.com"],
 "Pipedrive web":[r"pipedrive\.com",r"webforms\.pipedrive"],
 "Mautic":[r"mautic",r"mtc\.js"],
 "ActiveCampaign":[r"activecampaign\.com",r"trackcmp\.net"],
 "WhatsApp":[r"wa\.me/",r"api\.whatsapp\.com/send",r"whatsapp://"],
 "Contact Form 7":[r"contact-form-7",r"wpcf7"],
 "Typeform":[r"typeform\.com",r"embed\.typeform"],
 "Google Forms":[r"docs\.google\.com/forms"]
}
RX={n:[re.compile(p,re.I) for p in pats] for n,pats in SIG.items()}
def public_host(host):
 try: return all(ipaddress.ip_address(x[4][0]).is_global for x in socket.getaddrinfo(host,443,proto=socket.IPPROTO_TCP))
 except (OSError,ValueError): return False
def clean_host(raw):
 h=(urlparse(raw if "://" in raw else "https://"+raw).hostname or "").lower()
 if not re.fullmatch(r"[a-z0-9.-]+",h) or h.startswith(".") or ".." in h: raise ValueError("invalid hostname")
 return h
def safe_url(url):
 u=urlparse(url)
 return f"{u.scheme}://{u.hostname or ''}{u.path[:160]}"
def policy(host):
 try:
  with urlopen(Request(f"https://{host}/robots.txt",headers={"User-Agent":UA}),timeout=10) as f: txt=f.read(300000).decode("utf-8","replace")
 except HTTPError as e:
  if e.code not in (404,410):return None
  txt=""
 except Exception:return None
 p=RobotFileParser();p.parse(txt.splitlines());return p
def observe(html,requests):
 out={}
 for name,patterns in RX.items():
  matches=[r for r in requests if any(p.search(r["url"]) for p in patterns)]
  ok=[r for r in matches if 200<=r["status"]<400]
  from_html=any(p.search(html) for p in patterns)
  state=("NETWORK_2XX_3XX" if ok else "HTML_REFERENCED" if from_html else "NETWORK_REQUEST_ONLY" if matches else "NOT_OBSERVED_IN_TEST")
  out[name]={"state":state,"html_reference":from_html,"requests":len(matches),
             "successful_responses":len(ok),"samples":list(dict.fromkeys(safe_url(r["url"]) for r in (ok or matches)))[:3]}
 return out
async def audit(browser,item,timeout_ms,max_pages):
 h=clean_host(item["domain"]);other=h[4:] if h.startswith("www.") else "www."+h
 out={"account_id":item["account_id"],"company":item["company"],"domain":h,
 "checked_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "method":"Playwright Chromium HTML+network; no consent click; no form submission",
 "status":"NOT_TESTED","pages":[],"errors":[],"tech":{}}
 if not public_host(h):out["status"]="BLOCKED_DNS_OR_PRIVATE_IP";return out
 permitted={}
 for host in (h,other):
  if public_host(host):permitted[host]=await asyncio.to_thread(policy,host)
 if permitted.get(h) is None:out["status"]="ROBOTS_UNAVAILABLE";return out
 ctx=await browser.new_context(user_agent=UA,service_workers="block",accept_downloads=False,ignore_https_errors=False)
 page=await ctx.new_page()
 paths=["","/contato","/contact","/solucoes","/demonstracao"][:max(1,max_pages)]
 for path in paths:
  url=f"https://{h}{path}"
  if not permitted[h].can_fetch(UA,url):out["errors"].append("ROBOTS_DISALLOW:"+path);continue
  reqs=[]
  def on_req(request):reqs.append({"url":request.url,"status":0})
  def on_resp(response):
   for r in reversed(reqs):
    if r["url"]==response.url and r["status"]==0:r["status"]=response.status;break
  page.on("request",on_req);page.on("response",on_resp)
  try:
   resp=await page.goto(url,wait_until="domcontentloaded",timeout=timeout_ms)
   await page.wait_for_timeout(2200)
   final=clean_host(page.url)
   if final not in (h,other) or permitted.get(final) is None or not permitted[final].can_fetch(UA,page.url):
    out["errors"].append("UNAPPROVED_REDIRECT:"+safe_url(page.url));continue
   if urlparse(page.url).scheme!="https":out["errors"].append("NON_HTTPS_REDIRECT");continue
   if resp is None or resp.status>=400:out["errors"].append("BAD_HTTP:"+str(resp.status if resp else None));continue
   html=await page.content()
   out["pages"].append({"url":safe_url(page.url),"http_status":resp.status,
      "form_count":await page.locator("form").count(),
      "whatsapp_links":await page.locator('a[href*="wa.me"],a[href*="api.whatsapp.com"],a[href^="whatsapp:"]').count(),
      "tech":observe(html,reqs)})
  except Exception as e:out["errors"].append(type(e).__name__+":"+path)
  finally:page.remove_listener("request",on_req);page.remove_listener("response",on_resp)
 await ctx.close()
 rank={"NETWORK_2XX_3XX":4,"HTML_REFERENCED":3,"NETWORK_REQUEST_ONLY":2,"NOT_OBSERVED_IN_TEST":1}
 for tech in SIG:
  arr=[p["tech"][tech] for p in out["pages"]]
  out["tech"][tech]=max(arr,key=lambda x:rank[x["state"]]) if arr else {"state":"NOT_TESTED"}
 out["status"]="AUDITED" if out["pages"] else "NO_PAGES_AUDITED"
 return out
async def run(args):
 with open(args.csv,encoding="utf-8-sig",newline="") as f:rows=list(csv.DictReader(f))[:min(max(args.limit,1),30)]
 results=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True)
  for row in rows:
   try:result=await audit(browser,row,args.timeout_ms,args.max_pages)
   except Exception as e:result={"account_id":row.get("account_id"),"domain":row.get("domain"),"status":"ERROR","errors":[type(e).__name__]}
   results.append(result);print(result.get("domain"),result["status"],flush=True)
  await browser.close()
 Path(args.output).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf-8")
 with open(args.output_csv,"w",encoding="utf-8-sig",newline="") as f:
  columns=["account_id","company","domain","checked_at","audit_status","pages_audited"]+list(SIG)
  w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
  for r in results:
   w.writerow(dict(account_id=r.get("account_id"),company=r.get("company"),domain=r.get("domain"),
     checked_at=r.get("checked_at"),audit_status=r.get("status"),pages_audited=len(r.get("pages",[])),
     **{k:r.get("tech",{}).get(k,{}).get("state","NOT_TESTED") for k in SIG}))
if __name__=="__main__":
 ap=argparse.ArgumentParser()
 ap.add_argument("--csv",default="velora_scan_live/data/pilot.csv")
 ap.add_argument("--output",default="velora_live_results.json")
 ap.add_argument("--output-csv",default="velora_live_results.csv")
 ap.add_argument("--limit",type=int,default=10)
 ap.add_argument("--max-pages",type=int,default=2)
 ap.add_argument("--timeout-ms",type=int,default=14000)
 asyncio.run(run(ap.parse_args()))
