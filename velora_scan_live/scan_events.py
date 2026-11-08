"""Velora acquisition event audit: non-invasive WhatsApp CTA click test.

Uses Playwright on allowed public pages. Never fills/submits forms or sends WhatsApp
messages. Blocks navigation to WhatsApp endpoints, but clicks the on-site anchor
with a normal browser click to measure analytics requests/dataLayer events.
An undetected event is inconclusive, NOT proof of missing tracking.
"""
import argparse
import asyncio
import csv
import datetime
import ipaddress
import json
import re
import socket
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.robotparser import RobotFileParser
UA = "VeloraAcquisitionResearch/0.4 (public, no form submission)"
def clean_host(raw):
    h=(urlparse(raw if "://" in raw else "https://"+raw).hostname or "").lower()
    if not re.fullmatch(r"[a-z0-9.-]+",h) or h.startswith(".") or ".." in h:raise ValueError("invalid hostname")
    return h
def public_host(host):
    try:return all(ipaddress.ip_address(x[4][0]).is_global for x in socket.getaddrinfo(host,443,proto=socket.IPPROTO_TCP))
    except (OSError,ValueError):return False
def policy(host):
    try:
        with urlopen(Request(f"https://{host}/robots.txt",headers={"User-Agent":UA}),timeout=10) as f:
            txt=f.read(300000).decode("utf-8","replace")
    except HTTPError as e:
        if e.code not in (404,410):return None
        txt=""
    except Exception:return None
    r=RobotFileParser();r.parse(txt.splitlines());return r

WA_SELECTOR = 'a[href*="wa.me/"],a[href*="api.whatsapp.com/"],a[href*="web.whatsapp.com/"],a[href^="whatsapp:"]'
WA_HOSTS = {"wa.me", "api.whatsapp.com", "web.whatsapp.com", "www.whatsapp.com", "whatsapp.com"}
NONCONV_EVENTS = {"page_view", "session_start", "first_visit", "user_engagement", "scroll", "view_item", "gtm.js", "gtm.dom", "gtm.load"}


def safe_host_path(raw):
    u = urlparse(raw)
    return f"{u.scheme}://{u.hostname or ''}{u.path[:140]}"  # deliberately strips query and fragments


def sanitized_name(v):
    s = str(v or "")[:80]
    return s if re.fullmatch(r"[a-zA-Z0-9_.\- ]{1,80}", s) else "REDACTED_EVENT_NAME"


def classify_event(url):
    """Recognizes network calls sent *after* CTA interaction; never stores query payloads."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path
    q = parse_qs(parsed.query)
    if (host == "google-analytics.com" or host.endswith(".google-analytics.com")) and path.startswith("/g/collect"):
        name = sanitized_name((q.get("en") or [""])[0])
        return {"platform": "GA4", "event": name, "url":safe_host_path(url), "strong_conversion_label":bool(re.search(r"whats?app|generate_lead|contact|lead|click_to_chat",name,re.I))}
    if host in {"www.facebook.com", "facebook.com"} and path.startswith("/tr"):
        name=sanitized_name((q.get("ev") or [""])[0]);return {"platform":"Meta Pixel","event":name,"url":safe_host_path(url),"strong_conversion_label":bool(re.search(r"lead|contact|whats?app",name,re.I))}
    if host.endswith(".ads.linkedin.com") and path.startswith("/collect"):
        return {"platform":"LinkedIn Insight","event":"collect (type not verified)","url":safe_host_path(url),"strong_conversion_label":False}
    if host.endswith(".doubleclick.net") and ("/pagead/conversion" in path or "/pagead/1p-conversion" in path):
        return {"platform":"Google Ads","event":"conversion endpoint", "url":safe_host_path(url),"strong_conversion_label":True}
    return None


def is_public_redirect(original, final, alternate):
    p = urlparse(final)
    return p.scheme == "https" and (p.hostname or "").lower() in (original, alternate)


def summarize_datalayer(records):
    found=[]
    for r in records[:60]:
        try:
            if isinstance(r, dict):s=r.get("event", "")
            elif isinstance(r, list) and len(r)>1 and str(r[0])=="event":s=r[1]
            else:s=""
            if s:found.append(sanitized_name(s))
        except Exception:pass
    return list(dict.fromkeys(found))[:15]


async def audit_one(browser, item, timeout_ms):
    domain=clean_host(item["domain"]);other=domain[4:] if domain.startswith("www.") else "www."+domain
    result={"account_id":item.get("account_id"),"company":item.get("company"),"domain":domain,
            "checked_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "method":"Playwright real click on public WhatsApp anchor; outbound WhatsApp navigation blocked; no forms submitted",
            "status":"NOT_TESTED", "page_url":"", "whatsapp_count":0, "forms_count":0,
            "cta_tested":False,"click_outcome":"NOT_TESTED", "analytics_events_after_click":[],"datalayer_events_after_click":[],
            "errors":[],"findings":""}
    if not public_host(domain):result["status"]="BLOCKED_DNS_OR_PRIVATE_IP";return result
    robots={}
    for h in (domain,other):
        if public_host(h):robots[h]=await asyncio.to_thread(policy,h)
    if robots.get(domain) is None:
        result["status"]="ROBOTS_UNAVAILABLE";return result
    ctx=await browser.new_context(user_agent=UA,accept_downloads=False,service_workers="block")
    async def abort_wa(route):
        u=urlparse(route.request.url)
        if (u.hostname or "").lower() in WA_HOSTS:
            await route.abort("blockedbyclient")
        else:await route.continue_()
    await ctx.route("**/*",abort_wa)
    page=await ctx.new_page()
    requests=[]
    def onreq(req):
        entry=classify_event(req.url)
        if entry:requests.append(entry)
    page.on("request",onreq)
    page.on("popup",lambda popup:asyncio.create_task(popup.close()))
    try:
        for path in ("","/contato","/contact"):
            url=f"https://{domain}{path}"
            if not robots[domain].can_fetch(UA,url):result["errors"].append("ROBOTS_DISALLOW:"+path);continue
            try:
                response=await page.goto(url,wait_until="domcontentloaded",timeout=timeout_ms)
                await page.wait_for_timeout(1600)
                if not is_public_redirect(domain,page.url,other) or not robots.get(clean_host(page.url)) or not robots[clean_host(page.url)].can_fetch(UA,page.url):
                    result["errors"].append("UNAPPROVED_REDIRECT:"+safe_host_path(page.url));continue
                if not response or response.status>=400:
                    result["errors"].append("BAD_HTTP:"+str(response.status if response else None));continue
                result["status"]="PAGE_AUDITED"
                result["page_url"]=safe_host_path(page.url)
                result["forms_count"]=await page.locator("form").count()
                links=page.locator(WA_SELECTOR)
                result["whatsapp_count"]=await links.count()
                if result["whatsapp_count"]==0:continue
                selected=None
                for k in range(min(links.count(),6)):
                    link=links.nth(k)
                    if await link.is_visible():selected=link;break
                if selected is None:
                    result["click_outcome"]="CTA_NOT_VISIBLE";result["findings"]="WhatsApp anchor exists but not clickable in sampled viewport"
                    continue
                # Capture on-page dataLayer.push calls without collecting any event parameters / PII.
                await page.evaluate("""() => {
                  window.__veloraSeen = [];
                  let d = window.dataLayer;
                  if (!Array.isArray(d)) { d=[]; window.dataLayer=d; }
                  if(!d.__veloraWrapped) {
                    let orig=d.push;
                    d.push=function(...args){
                      for(const arg of args) {
                        if(arg && typeof arg==='object' && arg.event)window.__veloraSeen.push({event:String(arg.event)});
                        else if(arg && typeof arg==='object' && arg[0]==='event')window.__veloraSeen.push(['event',String(arg[1])]);
                      }
                      return orig.apply(this,args);
                    };
                    d.__veloraWrapped=true;
                  }
                }""")
                requests.clear()
                # An actual browser click; outbound WhatsApp URLs get aborted before loading.
                try:
                    await selected.click(timeout=4500,no_wait_after=True)
                    result["cta_tested"]=True
                    result["click_outcome"]="CLICK_EXECUTED_WHATSAPP_BLOCKED"
                except Exception as exc:
                    result["click_outcome"]="CLICK_ERROR"
                    result["errors"].append("CTA_CLICK:"+type(exc).__name__)
                await page.wait_for_timeout(2300)
                result["analytics_events_after_click"]=requests[:20]
                try:result["datalayer_events_after_click"]=summarize_datalayer(await page.evaluate("window.__veloraSeen || []"))
                except Exception:result["errors"].append("DATALAYER_NOT_RETRIEVABLE")
                if result["cta_tested"]:
                    result["status"]="CLICK_TESTED"
                    if result["analytics_events_after_click"]:
                        result["findings"]="Analytics request observed after CTA click; causality/attribution requires further validation"
                    elif result["datalayer_events_after_click"]:
                        result["findings"]="Only dataLayer events observed after CTA click; delivery to analytics unverified"
                    else:
                        result["findings"]="No analytics event observed after CTA click in test window (INCONCLUSIVE)"
                break
            except Exception as exc:
                result["errors"].append("NAVIGATION:"+type(exc).__name__+":"+path)
        if result["status"]=="PAGE_AUDITED" and not result["cta_tested"]:
            result["findings"]="No clickable WhatsApp CTA in sampled pages (INCONCLUSIVE)"
        if result["status"]=="NOT_TESTED":result["status"]="NO_PAGES_AUDITED"
    finally:
        await ctx.close()
    return result


async def run(args):
    with open(args.csv,encoding="utf-8-sig",newline="") as f:items=list(csv.DictReader(f))[:min(max(args.limit,1),20)]
    rows=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True)
        for item in items:
            try:r=await audit_one(browser,item,args.timeout_ms)
            except Exception as exc:
                r={"account_id":item.get("account_id"),"company":item.get("company"),"domain":item.get("domain"),"status":"ERROR", "errors":[type(exc).__name__]}
            print(r.get("domain"),r["status"],r.get("click_outcome"),flush=True)
            rows.append(r)
        await browser.close()
    Path(args.out_json).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
    with open(args.out_csv,"w",encoding="utf-8-sig",newline="") as f:
        fields=["account_id","company","domain","checked_at","status","page_url","whatsapp_count","forms_count","click_outcome","analytics_events","analytics_platforms","datalayer_events","strong_conversion_label_seen","findings","errors"]
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for r in rows:
            hits=r.get("analytics_events_after_click",[])
            w.writerow({"account_id":r.get("account_id"),"company":r.get("company"),"domain":r.get("domain"),"checked_at":r.get("checked_at"),
                        "status":r.get("status"),"page_url":r.get("page_url"),"whatsapp_count":r.get("whatsapp_count"),"forms_count":r.get("forms_count"),
                        "click_outcome":r.get("click_outcome"),"analytics_events":" | ".join(f'{h["platform"]}:{h["event"]}' for h in hits),
                        "analytics_platforms":" | ".join(sorted({h["platform"] for h in hits})),"datalayer_events":" | ".join(r.get("datalayer_events_after_click",[])),
                        "strong_conversion_label_seen":"SIM" if any(h["strong_conversion_label"] for h in hits) else "NÃO / INCONCLUSIVO",
                        "findings":r.get("findings"),"errors":" | ".join(r.get("errors",[]))})

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--csv",default="velora_scan_live/data/event_pilot.csv")
    ap.add_argument("--limit",type=int,default=10)
    ap.add_argument("--timeout-ms",type=int,default=14000)
    ap.add_argument("--out-json",default="velora_events.json")
    ap.add_argument("--out-csv",default="velora_events.csv")
    asyncio.run(run(ap.parse_args()))