import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from scan_events_control import compare
def row(platform,event,strong=False):return {"platform":platform,"event":event,"strong_conversion_label":strong}
class CompareTests(unittest.TestCase):
 def test_new_named_conversion(self):
  s,n,h=compare([row("GA4","page_view")],[row("GA4","click_whatsapp",True)],[])
  self.assertEqual(s,"INDICIO_COMERCIAL_APOS_CLIQUE")
  self.assertEqual(len(h),1)
 def test_background_equivalent(self):
  s,n,h=compare([row("GA4","page_view")],[row("GA4","page_view")],[])
  self.assertEqual(s,"SOMENTE_REQUISICOES_GENERICAS")
  self.assertFalse(n)
 def test_only_datalayer(self):
  self.assertEqual(compare([],[],["gtm.linkClick"])[0],"SOMENTE_DATALAYER_GENERICO")
 def test_pageview_after_click_is_generic(self):
  self.assertEqual(compare([], [row("GA4","page_view")], [])[0], "SOMENTE_REQUISICOES_GENERICAS")
 def test_named_datalayer_not_sent(self):
  self.assertEqual(compare([], [], ["whatsapp_click"])[0], "DATALAYER_COM_EVENTO_NOMEADO")
 def test_negative_inconclusive(self):
  self.assertEqual(compare([],[],[])[0],"SEM_EVENTO_OBSERVADO_INCONCLUSIVO")
if __name__=="__main__":unittest.main()
