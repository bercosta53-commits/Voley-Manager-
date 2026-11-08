import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from scan import observe,safe_url,clean_host
class DetectionTests(unittest.TestCase):
 def test_gtm_network(self):
  self.assertEqual(observe('',[{"url":"https://www.googletagmanager.com/gtm.js?id=GTM-ABCDE","status":200}])["GTM"]["state"],"NETWORK_2XX_3XX")
 def test_ga4_hit(self):
  self.assertEqual(observe('',[{"url":"https://www.google-analytics.com/g/collect?en=page_view","status":204}])["GA4"]["state"],"NETWORK_2XX_3XX")
 def test_meta_pending(self):
  self.assertEqual(observe('',[{"url":"https://www.facebook.com/tr?id=1","status":0}])["Meta Pixel"]["state"],"NETWORK_REQUEST_ONLY")
 def test_hubspot_html(self):
  self.assertEqual(observe('<script src="https://js.hsforms.net/forms/embed/v2.js"></script>',[])["HubSpot web"]["state"],"HTML_REFERENCED")
 def test_non_detection_is_not_absence(self):
  self.assertEqual(observe('',[])["GA4"]["state"],"NOT_OBSERVED_IN_TEST")
 def test_safe_url_redacts_token(self):
  self.assertEqual(safe_url("https://example.com/?email=a@b.com&token=1"),"https://example.com/")
 def test_bad_domain(self):
  with self.assertRaises(ValueError):clean_host("invalid domain")
if __name__=="__main__":unittest.main()
