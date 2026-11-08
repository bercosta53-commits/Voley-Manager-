"""Velora L07: control versus WhatsApp CTA event observation.
Non-invasive. No form submit. No outbound WhatsApp navigation. No consent click.
Absence of observation does not imply absent tracking.
"""
import argparse, asyncio, csv, datetime, json, re
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from scan_events import (UA, WA_SELECTOR, WA_HOSTS, clean_host, public_host,
                         policy, is_public_redirect, classify_event, summarize_datalayer,
                         safe_host_path)

def signature(record):
    return record["platform"] + ":" + record["event"]

def compare(baseline, after, dl):
    baseline_signatures={signature(x) for x in baseline}
    novel=[x for x in after if signature(x) not in baseline_signatures]
    meaningful=[x for x in novel if x.get("strong_conversion_label")]
    if meaningful:
        level="INDICIO_FORTE_EVENTO_APOS_CLIQUE"
    elif novel:
        level="REQUISICAO_NOVA_APOS_CLIQUE"
    elif after:
        level="REQUISICAO_SEM_DIFERENCA_DO_CONTROLE"
    elif dl:
        level="SOMENTE_DATALAYER"
    else:
        level="SEM_EVENTO_OBSERVADO_INCONCLUSIVO"
    return level,novel,meaningful

async def guarded_route(route):
    host=(urlparse(route.request.url).hostname or "").lower()
    if host in WA_HOSTS:
        await route.abort("blockedbyclient")
    else:
        await route.continue_()

async def page_ready(page, domain, other, robots, path, timeout):
    target=f"https://{domain}{path}"
    if not robots[domain].can_fetch(UA,target):return "ROBOTS_DISALLOW"
    try:
        resp=await page.goto(target,wait_until="domcontentloaded",timeout=timeout)
        await page.wait_for_timeout(2000)
        if not is_public_redirect(domain,page.url,other):return "UNAPPROVED_REDIRECT"
        host=clean_host(page.url)
        if robots.get(host) is None or not robots[host].can_fetch(UA,page.url):return "ROBOTS_BLOCK"
        if not resp or resp.status>=400:return "HTTP_ERROR"
        return "OK"
    except Exception as exc:return "NAV_"+type(exc).__name__

def collector(page,target):
    def req(request):
        ev=classify_event(request.url)
        if ev:target.append(ev)
    page.on("request",req)

async def installed_datalayer(page):
    await page.evaluate("""() => {
      window.__veloraEvents=[];
      const d=Array.isArray(window.dataLayer)?window.dataLayer:(window.dataLayer=[]);
      if(d.__veloraWrapped)return;
      const orig=d.push;
      d.push=function(...args){
        for(const x of args) {
          if(x && typeof x==='object' && typeof x.event==='string') {
            window.__veloraEvents.push({event:x.event});
          }
          else if(x && typeof x==='object' && x[0]==='event') {
            window.__veloraEvents.push(['event',String(x[1])]);
          }
        }
        return orig.apply(this,args);
      };
      d.__veloraWrapped=true;
    }""")

async def audit_one(browser,item,timeout_ms):
    domain=clean_host(item["domain"])
    other=domain[4:] if domain.startswith("www.") else "www."+domain
    out={"account_id":item.get("account_id"),"company":item.get("company"),
         "domain":domain,"checked_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
         "status":"NOT_TESTED","method":"Chromium separate control page versus real WhatsApp click; consent untouched",
         "cta_count":0,"clicked":False,"page_url":"",
         "baseline_events":[],"after_click_events":[],"new_after_click_events":[],
         "strong_new_events":[],"datalayer_events":[],"conclusion":"NAO_TESTADO","errors":[]}
    if not public_host(domain):
        out["status"]="DNS_BLOCKED";return out
    robots={}
    for host in (domain,other):
        if public_host(host):robots[host]=await asyncio.to_thread(policy,host)
    if robots.get(domain) is None:
        out["status"]="ROBOTS_UNAVAILABLE";return out
    ctx=await browser.new_context(user_agent=UA,service_workers="block",accept_downloads=False,
                                   ignore_https_errors=False)
    await ctx.route("**/*",guarded_route)
    try:
        for path in ("","/contato","/contact"):
            control=await ctx.new_page()
            base=[]
            collector(control,base)
            ready=await page_ready(control,domain,other,robots,path,timeout_ms)
            if ready!="OK":
                out["errors"].append(path+":"+ready)
                await control.close();continue
            links=control.locator(WA_SELECTOR)
            count=await links.count()
            out["cta_count"]=count
            if count==0:
                await control.close();continue
            visible=False
            for i in range(min(count,6)):
                if await links.nth(i).is_visible():visible=True;break
            if not visible:
                out["errors"].append("CTA_NOT_VISIBLE:"+path)
                await control.close();continue
            # New requests during the quiet period, without any user action.
            base.clear()
            await control.wait_for_timeout(2600)
            out["baseline_events"]=base[:30]
            await control.close()
            test=await ctx.new_page()
            after=[]
            collector(test,after)
            ready=await page_ready(test,domain,other,robots,path,timeout_ms)
            if ready!="OK":
                out["errors"].append("CLICK_PAGE:"+ready)
                await test.close();continue
            chosen=None
            buttons=test.locator(WA_SELECTOR)
            for j in range(min(await buttons.count(),6)):
                if await buttons.nth(j).is_visible():
                    chosen=buttons.nth(j);break
            if chosen is None:
                out["errors"].append("CTA_DISAPPEARED")
                await test.close();continue
            out["page_url"]=safe_host_path(test.url)
            await installed_datalayer(test)
            after.clear()
            try:
                await chosen.click(timeout=5000,no_wait_after=True)
                out["clicked"]=True
            except Exception as exc:
                out["errors"].append("CLICK:"+type(exc).__name__)
            await test.wait_for_timeout(2600)
            out["after_click_events"]=after[:30]
            try:out["datalayer_events"]=summarize_datalayer(
                await test.evaluate("window.__veloraEvents||[]"))
            except Exception:out["errors"].append("DATALAYER_UNAVAILABLE")
            if out["clicked"]:
                level,novel,strong=compare(out["baseline_events"],out["after_click_events"],
                                            out["datalayer_events"])
                out["status"]="CONTROL_AND_CTA_TESTED"
                out["conclusion"]=level
                out["new_after_click_events"]=novel[:20]
                out["strong_new_events"]=strong[:10]
                out["findings"]="Correlation only. Baseline is an idle control; no causal guarantee."
                await test.close();break
            await test.close()
        else:
            out["status"]="NO_CLICK_TEST"
            out["conclusion"]="CTA_NAO_DISPONIVEL_OU_TESTE_BLOQUEADO"
    finally:await ctx.close()
    return out

async def run(args):
    with open(args.csv,encoding="utf-8-sig",newline="") as f:
        items=list(csv.DictReader(f))[:min(15,max(args.limit,1))]
    rows=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True)
        for item in items:
            try:r=await audit_one(browser,item,args.timeout_ms)
            except Exception as e:r={"account_id":item.get("account_id"),"domain":item.get("domain"),
                        "status":"ERROR","conclusion":"NAO_TESTADO","errors":[type(e).__name__]}
            print(r.get("domain"),r["status"],r.get("conclusion"),flush=True)
            rows.append(r)
        await browser.close()
    Path(args.out_json).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
    with open(args.out_csv,"w",encoding="utf-8-sig",newline="") as f:
        fields=["account_id","company","domain","checked_at","status","conclusion","page_url",
                "clicked","cta_count","baseline_events","after_click_events",
                "new_after_click_events","strong_new_events","datalayer_events","errors"]
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for r in rows:
            fields_row={k:r.get(k,"") for k in fields}
            for k in ["baseline_events","after_click_events","new_after_click_events","strong_new_events"]:
                fields_row[k]=" | ".join(signature(x) for x in r.get(k,[]))
            fields_row["datalayer_events"]=" | ".join(r.get("datalayer_events",[]))
            fields_row["errors"]=" | ".join(r.get("errors",[]))
            w.writerow(fields_row)
if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--csv",default="velora_scan_live/data/event_control_pilot.csv")
    ap.add_argument("--limit",type=int,default=10)
    ap.add_argument("--timeout-ms",type=int,default=14000)
    ap.add_argument("--out-json",default="velora_event_control.json")
    ap.add_argument("--out-csv",default="velora_event_control.csv")
    asyncio.run(run(ap.parse_args()))
