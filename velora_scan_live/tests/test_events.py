import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from scan_events import classify_event,safe_host_path,summarize_datalayer
class TestEvents(unittest.TestCase):
 def test_ga4(self):
  r=classify_event('https://www.google-analytics.com/g/collect?en=click_whatsapp&email=secret')
  self.assertEqual(r['event'],'click_whatsapp');self.assertTrue(r['strong_conversion_label']);self.assertNotIn('secret',str(r))
 def test_meta(self):
  self.assertEqual(classify_event('https://www.facebook.com/tr?ev=Lead')['platform'],'Meta Pixel')
 def test_linkedin(self):
  self.assertFalse(classify_event('https://px.ads.linkedin.com/collect?conversionId=2')['strong_conversion_label'])
 def test_no_false_google_ads_conversion(self):
  self.assertIsNone(classify_event('https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/'))
 def test_privacy(self):
  self.assertEqual(safe_host_path('https://foo.com/x?tel=123#f'),'https://foo.com/x')
 def test_datalayer(self):
  self.assertEqual(summarize_datalayer([{'event':'whatsapp_click'},['event','lead']]),['whatsapp_click','lead'])
if __name__=='__main__':unittest.main()
