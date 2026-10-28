/**
 * Display-only public OANDA oil CFD charts using TradingView's official widget.
 * No quote scraping, iframe document access, provider credentials or model input.
 * Widget/iframe load events confirm display plumbing only, never quote freshness.
 */
const WIDGET_SCRIPT='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
const LOAD_TIMEOUT_MS=15_000;
const MARKETS={
 wti:{symbol:'OANDA:WTICOUSD',description:'WTI 原油差价合约（CFD）· OANDA'},
 brent:{symbol:'OANDA:BCOUSD',description:'布伦特原油差价合约（CFD）· OANDA'},
};
const $=selector=>document.querySelector(selector);
const mount=$('#public-market-chart');
let selected='wti',generation=0,dispose=()=>{};

function loadMarket(market){
 if(!Object.hasOwn(MARKETS,market))return;
 dispose();selected=market;const current=++generation;const cleanups=[];let timer=null,observer=null,finished=false;
 const live=()=>current===generation;
 const setStatus=(status,message,stage)=>{if(!live())return;$('#live-status').textContent=status;$('#public-market-message').textContent=message;if(stage)mount.dataset.loadStage=stage;};
 const stopWaiting=()=>{if(timer!==null){clearTimeout(timer);timer=null;}observer?.disconnect();mount.setAttribute('aria-busy','false');$('#public-market-retry').disabled=false;};
 const fail=(message,stage='error')=>{if(!live()||finished)return;finished=true;stopWaiting();setStatus('DISPLAY UNCONFIRMED',message,stage);};
 dispose=()=>{if(timer!==null)clearTimeout(timer);observer?.disconnect();for(const cleanup of cleanups)cleanup();};
 for(const tab of document.querySelectorAll('[data-market]')){const active=tab.dataset.market===market;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
 mount.setAttribute('aria-labelledby',market==='wti'?'public-wti':'public-brent');mount.setAttribute('aria-busy','true');$('#public-market-retry').disabled=true;
 $('#public-market-symbol').textContent=MARKETS[market].symbol;$('#public-market-description').textContent=MARKETS[market].description;
 $('#live-provider').textContent='TradingView / OANDA CFDs';$('#live-asof').textContent='请查看图表内时间';
 setStatus('LOADING CHART','正在加载公开图表；报价时间、延迟和休市状态以图表内标识为准。','loading-script');

 // This is the documented TradingView widget container + configuration script.
 const container=document.createElement('div');container.className='tradingview-widget-container';
 const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';
 const copyright=document.createElement('div');copyright.className='tradingview-widget-copyright';
 const credit=document.createElement('a');credit.href='https://www.tradingview.com/';credit.target='_blank';credit.rel='noopener noreferrer';credit.textContent='Track all markets on TradingView';copyright.append(credit);
 container.append(widget,copyright);mount.replaceChildren(container);
 const trackedFrames=new WeakSet();
 function watchFrames(){
  if(!live()||finished)return;
  for(const frame of container.querySelectorAll('iframe')){
   if(trackedFrames.has(frame))continue;trackedFrames.add(frame);
   frame.title=`TradingView ${MARKETS[market].description} 图表`;
   setStatus('LOADING MARKET VIEW','正在载入行情视图；也可直接打开下方提供方页面。','frame-added');
   const loaded=()=>{if(!live()||finished)return;finished=true;stopWaiting();setStatus('MARKET VIEW LOADED','图表已载入；报价时间、延迟和休市状态以图表内标识为准。','frame-loaded');};
   const failed=()=>fail('图表暂时无法显示。请重试，或打开下方 TradingView 链接。');
   frame.addEventListener('load',loaded);frame.addEventListener('error',failed);
   cleanups.push(()=>{frame.removeEventListener('load',loaded);frame.removeEventListener('error',failed);});
  }
 }
 if(typeof MutationObserver==='function'){observer=new MutationObserver(watchFrames);observer.observe(container,{childList:true,subtree:true});}
 const script=document.createElement('script');script.type='text/javascript';script.src=WIDGET_SCRIPT;script.async=true;
 script.textContent=JSON.stringify({
  autosize:true,symbol:MARKETS[market].symbol,interval:'15',timezone:'Asia/Shanghai',
  theme:'light',style:'1',locale:'zh_CN',allow_symbol_change:false,
  calendar:false,hide_side_toolbar:false,support_host:'https://www.tradingview.com',
 });
 const scriptLoaded=()=>{if(!live()||finished)return;setStatus('LOADING MARKET VIEW','正在载入行情视图；也可直接打开下方提供方页面。','script-loaded');watchFrames();};
 const scriptFailed=()=>fail('公开图表暂时无法显示。请重试，或打开下方 TradingView 链接。');
 script.addEventListener('load',scriptLoaded);script.addEventListener('error',scriptFailed);
 cleanups.push(()=>{script.removeEventListener('load',scriptLoaded);script.removeEventListener('error',scriptFailed);});
 timer=setTimeout(()=>fail('等待图表超过 15 秒。请重试，或打开下方 TradingView 链接。','timeout'),LOAD_TIMEOUT_MS);
 container.append(script);
}
for(const tab of document.querySelectorAll('[data-market]')){
 tab.addEventListener('click',()=>{if(tab.dataset.market!==selected)loadMarket(tab.dataset.market);});
 tab.addEventListener('keydown',event=>{const tabs=[...document.querySelectorAll('[data-market]')];let index=tabs.indexOf(tab);if(event.key==='ArrowRight'||event.key==='ArrowLeft')index=1-index;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();loadMarket(tabs[index].dataset.market);tabs[index].focus();});
}
$('#public-market-retry').addEventListener('click',()=>loadMarket(selected));
loadMarket(selected);
