import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from scan_events_consent import compare,CONSENT_SNAPSHOT_JS
def ev(name,status,commercial=True):
 return {"platform":"GA4","event":name,"http_status":status,"strong_conversion_label":commercial}
class TestConsentEvidence(unittest.TestCase):
 def test_http_success(self):
  self.assertEqual(compare([],[ev("whatsapp_click",204)],[])[0],"COMERCIAL_RESPOSTA_HTTP_OBSERVADA")
 def test_request_no_response(self):
  self.assertEqual(compare([],[ev("whatsapp_click",None)],[])[0],"COMERCIAL_REQUEST_SEM_RESPOSTA_CONFIRMADA")
 def test_pageview_not_conversion(self):
  self.assertEqual(compare([],[ev("page_view",204,False)],[])[0],"APENAS_NETWORK_GENERICA")
 def test_background_not_incremental(self):
  e=ev("whatsapp_click",204)
  self.assertEqual(compare([e],[e],[])[0],"APENAS_NETWORK_GENERICA")
 def test_named_datalayer_only(self):
  self.assertEqual(compare([],[],["whatsapp_click"])[0],"DATALAYER_EVENTO_COMERCIAL_SEM_NETWORK")
 def test_consent_passive(self):
  self.assertIn("consent_mode_observed",CONSENT_SNAPSHOT_JS)
if __name__=="__main__":unittest.main()
