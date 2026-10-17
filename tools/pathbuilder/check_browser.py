"""Smoke-test the built frontend on port 3000; start the server first."""
import os
import tempfile
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
out=Path(os.environ.get('PATHBUILDER_REVIEW_DIR', tempfile.mkdtemp(prefix='pathbuilder-review-')))
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('PATHBUILDER_CHROMIUM'),headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
 # Do not send test browsing traffic to analytics, social, or production hosts.
 context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(('http://127.0.0.1:3000/','data:','blob:')) else route.abort())
 page=context.new_page();errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 response=page.goto('http://127.0.0.1:3000/',wait_until='networkidle')
 assert response.status==200
 assert 'PathBuilder' in page.title(),page.title()
 assert page.get_by_text('PathBuilder · Plan. Build. Grow.').is_visible()
 assert page.get_by_role('img', name='PathBuilder', exact=True).count()>0
 assert 'Join 10,000+' not in page.locator('body').inner_text()
 page.screenshot(path=str(out/'login-desktop.png'),full_page=True)
 page.evaluate("localStorage.setItem('theme','dark')");page.reload(wait_until='networkidle')
 assert 'dark' in page.locator('html').get_attribute('data-theme')
 page.screenshot(path=str(out/'login-dark.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.reload(wait_until='networkidle')
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
 page.screenshot(path=str(out/'login-mobile.png'),full_page=True)
 for asset in ['pathbuilder-email-dark.png','pathbuilder-email-white.png','pathbuilder-mark.svg','pathbuilder-lockup.svg']:
  response=context.request.get('http://127.0.0.1:3000/branding/'+asset)
  assert response.status==200,(asset,response.status)
  assert response.headers.get('content-type','').startswith('image/'),response.headers
 # Direct SPA routes used to crash serve-handler before the override fix.
 assert context.request.get('http://127.0.0.1:3000/accounts/forgot-password/').status==200
 (out/'browser-smoke.json').write_text(json.dumps({'http':200,'desktop':True,'dark':True,'mobile':True,'horizontal_overflow':False,'assets':4,'spa_deep_link':True,'page_errors':errors},indent=2))
 assert not errors, errors[:3]
 browser.close()
print('Browser smoke checks passed; screenshots saved.')
