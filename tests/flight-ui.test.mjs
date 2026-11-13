import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { polyline } from "./svg-polyline-helper.mjs";

let mountId = 0;
async function mount(t, { preset = null, reducedMotion = false, language = "en", solve = true } = {}) {
  const [html, sourceText] = await Promise.all([
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/data/fuel-sources.json", import.meta.url),
      "utf8",
    ),
  ]);
  const { document, window } = parseHTML(html);
  window.location = { hash: "", replace() {} };
  window.localStorage = { getItem: () => language, setItem() {} };
  window.matchMedia = () => ({ matches: reducedMotion });
  // Linkedom has no SVG geometry. Measure the emitted M/L polylines;
  // browser QA additionally verifies native SVG sampling and rendering.
  const geometryPrototypes = [
    window.SVGElement.prototype,
    window.HTMLElement.prototype,
  ];
  const geometryDescriptors = [];

  for (const [name, value] of Object.entries({
    getTotalLength() { return polyline(this).length; },
    getPointAtLength(distance) { return polyline(this).at(distance); },
  })) {
    for (const prototype of geometryPrototypes) {
      geometryDescriptors.push([
        prototype,
        name,
        Object.getOwnPropertyDescriptor(prototype, name),
      ]);
      Object.defineProperty(prototype, name, { value, configurable: true });
    }
  }
  const originals = new Map();
  for (const [name, value] of Object.entries({
    document,
    window,
    CustomEvent: window.CustomEvent,
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    fetch: async (url) => {
      assert.equal(url, "./data/fuel-sources.json");
      return { ok: true, json: async () => JSON.parse(sourceText) };
    },
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
  t.after(() => {
    window.dispatchEvent(new window.Event("pagehide"));
    for (const [prototype, name, descriptor] of geometryDescriptors) {
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
      else delete prototype[name];
    }
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  // Linkedom does not implement native form validity or select.value setters.
  // These tests drive app events; optimizer tests validate numeric constraints.
  Object.defineProperty(document.querySelector("#flight-date"), "validity", {
    value: { valid: true },
  });
  for (const [id, initial] of [["aircraft", "widebody"], ["scenario-preset", "global"], ["map-scope", "global"]]) {
    let value = initial;
    Object.defineProperty(document.querySelector(`#${id}`), "value", {
      get: () => value, set: next => { value = String(next); }, configurable: true,
    });
  }
  const dialog = document.querySelector("#import-dialog");
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
  };
  await import(`../dist/flight-app.js?flight-ui-test=${++mountId}`);
  // Let the real source catalog finish rendering before restoring globals.
  await new Promise((resolve) => setImmediate(resolve));
  const $ = (selector) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing UI element ${selector}`);
    return element;
  };
  const fire = (selector, type) =>
    $(selector).dispatchEvent(
      new window.Event(type, { bubbles: true, cancelable: true }),
    );
  if (preset) {
    $("#scenario-preset").value = preset;
    fire("#scenario-preset", "change");
    fire("#load-example", "click");
    if (solve) fire("#rotation-form", "submit");
  }
  const input = (selector, value) => {
    $(selector).value = String(value);
    fire(selector, "input");
  };
  return {
    $,
    document,
    window,
    input,
    fire,
    click: (selector) => fire(selector, "click"),
    calculate: () => fire("#rotation-form", "submit"),
    select: (selector, value) => {
      Object.defineProperty($(selector), "value", {value,configurable:true});
      fire(selector,"change");
    },
    setRoute: codes => {
      fire("#reset-plan","click");
      Object.defineProperty($('[data-leg="0"][data-key="from"]'),"value",{value:codes[0],configurable:true});
      fire('[data-leg="0"][data-key="from"]',"change");
      codes.slice(1).forEach((code,index) => {
        if(index>0) fire("#add-leg","click");
        const selector=`[data-leg="${index}"][data-key="to"]`;
        Object.defineProperty($(selector),"value",{value:code,configurable:true});
        fire(selector,"change");
      });
    },
  };
}

function trackFocus(t, document, window) {
  const activeDescriptor = Object.getOwnPropertyDescriptor(document, "activeElement");
  let active = document.body;
  Object.defineProperty(document, "activeElement", { get: () => active, configurable: true });
  const descriptors = [];
  for (const prototype of [window.HTMLElement.prototype, window.SVGElement.prototype]) {
    descriptors.push([prototype, Object.getOwnPropertyDescriptor(prototype, "focus")]);
    Object.defineProperty(prototype, "focus", { configurable: true, value() {
      active = this;
      this.dispatchEvent(new window.Event("focus"));
    } });
  }
  t.after(() => {
    for (const [prototype, descriptor] of descriptors.reverse()) {
      if (descriptor) Object.defineProperty(prototype, "focus", descriptor);
      else delete prototype.focus;
    }
    if (activeDescriptor) Object.defineProperty(document, "activeElement", activeDescriptor);
    else delete document.activeElement;
  });
}


test("initial model is an empty route builder with no computed result or autoplay",async t=>{
 const ui=await mount(t);const {$,document}=ui;
 assert.equal(document.querySelectorAll('#leg-rows tr').length,1);
 assert.equal($('[data-leg="0"][data-key="from"]').value||'', '');
 assert.equal($('[data-leg="0"][data-key="to"]').value||'', '');
 assert.equal(document.querySelector('#animated-plane'),null);
 assert.equal(document.querySelectorAll('.route-path').length,0);
 assert.equal(document.querySelectorAll('.map-airport').length,67);
 assert.equal($('#savings').textContent,'—');assert.equal($('#download-plan').disabled,true);
 assert.equal($('#motion-toggle').disabled,true);
 assert.doesNotThrow(()=>ui.click('#fit-route'));
 assert.doesNotMatch($('#flight-map').getAttribute('viewBox'),/NaN|Infinity/);
});
test("a user-selected single flight derives inputs and calculates required uplift",async t=>{
 const ui=await mount(t);const {$,setRoute,calculate,document}=ui;
 setRoute(['SIN','BKK']);
 assert.ok(Number($('[data-leg="0"][data-key="baseBurnT"]').value)>0);
 assert.ok(Number($('[data-leg="0"][data-key="priceUsdPerT"]').value)>0);
 assert.match($('.leg-derivation').textContent,/km.*h/);
 assert.equal($('#savings').textContent,'—');assert.equal(document.querySelector('#animated-plane'),null);
 calculate();assert.equal($('#model-error').hidden,true);assert.equal($('#savings').textContent,'$0');
 assert.equal($('#download-plan').disabled,false);assert.ok(document.querySelector('#animated-plane'));
});
test("changing a destination regenerates burn and reserve instead of retaining an unrelated flight",async t=>{
 const ui=await mount(t);const {$,setRoute,select,input}=ui;
 setRoute(['SIN','BKK','SIN']);const burn=Number($('[data-leg="0"][data-key="baseBurnT"]').value);
 input('[data-leg="0"][data-key="baseBurnT"]',99);
 assert.match($('.leg-derivation').textContent,/Edited inputs/);
 select('[data-leg="0"][data-key="to"]','LHR');
 assert.notEqual(Number($('[data-leg="0"][data-key="baseBurnT"]').value),99);
 assert.ok(Number($('[data-leg="0"][data-key="baseBurnT"]').value)>burn);
 assert.equal($('[data-leg="1"][data-key="from"]').value,'LHR');
 assert.ok(Number($('[data-leg="1"][data-key="baseBurnT"]').value)>burn);
 assert.equal($('#savings').textContent,'—');
});
test("aircraft changes regenerate performance but preserve starting fuel",async t=>{
 const ui=await mount(t);const {$,setRoute,select,input}=ui;
 setRoute(['SIN','BKK']);const original=Number($('[data-leg="0"][data-key="baseBurnT"]').value);
 input('#initial-fuel',2);select('#aircraft','narrowbody');
 assert.equal($('#initial-fuel').value,'2');
 assert.notEqual(Number($('[data-leg="0"][data-key="baseBurnT"]').value),original);
});
test("examples are explicit inputs and never calculate or play until requested",async t=>{
 const ui=await mount(t);const {$,fire,click,calculate,document}=ui;
 $('#scenario-preset').value='global';fire('#scenario-preset','change');
 assert.equal(document.querySelectorAll('#leg-rows tr').length,1);assert.equal($('#savings').textContent,'—');
 click('#load-example');assert.equal(document.querySelectorAll('#leg-rows tr').length,4);
 assert.equal($('#savings').textContent,'—');assert.equal(document.querySelector('#animated-plane'),null);
 calculate();assert.equal($('#model-error').hidden,true);assert.ok(document.querySelector('#animated-plane'));
 click('#reset-plan');assert.equal(document.querySelectorAll('#leg-rows tr').length,1);assert.equal(document.querySelector('#animated-plane'),null);
});
test("stops reorder and collapse into a continuous route, with one to five legs",async t=>{
 const ui=await mount(t);const {$,setRoute,click,document}=ui;
 setRoute(['SIN','BKK','HKG','NRT']);
 click('[data-move-stop="1"][data-direction="up"]');
 assert.equal($('[data-leg="0"][data-key="to"]').value,'HKG');
 assert.equal($('[data-leg="1"][data-key="from"]').value,'HKG');
 assert.equal($('[data-leg="1"][data-key="to"]').value,'BKK');
 click('[data-remove="1"]');assert.equal($('[data-leg="1"][data-key="from"]').value,'HKG');assert.equal($('[data-leg="1"][data-key="to"]').value,'NRT');
 click('#add-leg');click('#add-leg');click('#add-leg');assert.equal(document.querySelectorAll('#leg-rows tr').length,5);assert.equal($('#add-leg').disabled,true);
});
test("editing numeric inputs invalidates results and export immediately",async t=>{
 const ui=await mount(t,{preset:'eastasia'});const {$,input,calculate}=ui;
 assert.equal($('#download-plan').disabled,false);input('[data-leg="0"][data-key="baseBurnT"]',8.5);
 assert.equal($('#savings').textContent,'—');assert.equal($('#download-plan').disabled,true);assert.equal($('#play-route').disabled,true);
 calculate();assert.equal($('#model-error').hidden,true);
});
test("missing imported prices never fall back to the complete scenario dataset",async t=>{
 const ui=await mount(t);const {$,setRoute,click,calculate}=ui;
 setRoute(['SYD','MEL']);assert.ok(Number($('[data-leg="0"][data-key="priceUsdPerT"]').value)>0);
 click('#mode-quotes');assert.equal($('[data-leg="0"][data-key="priceUsdPerT"]').value,'');
 calculate();assert.match($('#model-error').textContent,/SYD.*no valid quotation/);assert.equal($('#download-plan').disabled,true);
});
test("blank performance inputs show actionable errors",async t=>{
 const ui=await mount(t,{preset:'eastasia'});const {$,input,calculate}=ui;
 input('[data-leg="0"][data-key="baseBurnT"]','');calculate();
 assert.match($('#model-error').textContent,/base leg burn.*finite/);assert.equal($('#download-plan').disabled,true);
});
test("price edits do not bypass the selected aircraft distance envelope",async t=>{
 const ui=await mount(t);const {$,setRoute,select,input,calculate}=ui;
 select('#aircraft','narrowbody');setRoute(['SIN','LHR']);input('[data-leg="0"][data-key="priceUsdPerT"]',777);calculate();
 assert.match($('#model-error').textContent,/outside this aircraft profile/);assert.equal($('#download-plan').disabled,true);
});
test("changing assumptions updates generated inputs but keeps explicit edits",async t=>{
 const ui=await mount(t);const {$,setRoute,input,document,window}=ui;
 setRoute(['SIN','BKK','SIN']);input('[data-leg="0"][data-key="priceUsdPerT"]',777);input('[data-leg="0"][data-key="baseBurnT"]',9);
 document.dispatchEvent(new window.CustomEvent('scenarioassumptionschange',{detail:{options:{pricing:{baseJetUsdPerT:1600}}}}));
 assert.equal($('[data-leg="0"][data-key="priceUsdPerT"]').value,'777');assert.equal($('[data-leg="0"][data-key="baseBurnT"]').value,'9');
 assert.ok(Number($('[data-leg="1"][data-key="priceUsdPerT"]').value)>1600);assert.equal($('#savings').textContent,'—');
});
test("language changes preserve route, edited inputs and calculated results",async t=>{
 const ui=await mount(t,{preset:'eastasia'});const {$,input,calculate,window,document}=ui;
 input('[data-leg="0"][data-key="priceUsdPerT"]',777);calculate();
 const cost=$('#optimized-cost').textContent;const before=[...document.querySelectorAll('#rotation-form input')].map(el=>el.value);
 window.FuelI18n.setLanguage('zh');
 assert.equal($('#optimized-cost').textContent,cost);assert.equal($('[data-leg="0"][data-key="priceUsdPerT"]').value,'777');
 assert.deepEqual([...document.querySelectorAll('#rotation-form input')].map(el=>el.value),before);
 assert.match($('#motion-phase').textContent,/加油|无需/);assert.match($('.leg-derivation').textContent,/公里/);
 window.FuelI18n.setLanguage('en');assert.match($('.leg-derivation').textContent,/km/);assert.equal($('#optimized-cost').textContent,cost);
});
test("map keyboard entry stays singular and excludes cropped airports",async t=>{
 const ui=await mount(t,{reducedMotion:true});const {$,document,window,fire}=ui;trackFocus(t,document,window);
 assert.equal(document.querySelectorAll('.map-airport[tabindex="0"]').length,1);
 $('#map-scope').value='eastasia';fire('#map-scope','change');
 const [x,y,w,h]=$('#flight-map').getAttribute('viewBox').split(/\s+/).map(Number);
 const inside=n=>Number(n.dataset.mapX)>=x&&Number(n.dataset.mapX)<=x+w&&Number(n.dataset.mapY)>=y&&Number(n.dataset.mapY)<=y+h;
 for(const n of document.querySelectorAll('.map-airport'))if(!inside(n))assert.equal(n.getAttribute('tabindex'),'-1');
 document.querySelector('.map-airport[tabindex="0"]').focus();
 const e=new window.Event('keydown',{bubbles:true,cancelable:true});e.key='ArrowRight';document.activeElement.dispatchEvent(e);
 assert.ok(inside(document.activeElement));assert.equal(document.querySelectorAll('.map-airport[tabindex="0"]').length,1);
});
test("route changes preserve focus on a usable control",async t=>{
 const ui=await mount(t);const {$,document,window,setRoute,select,click}=ui;trackFocus(t,document,window);
 setRoute(['SIN','BKK','HKG']);const selector='[data-leg="0"][data-key="to"]';$(selector).focus();select(selector,'KUL');assert.equal(document.activeElement,$(selector));
 $('[data-remove="1"]').focus();click('[data-remove="1"]');assert.equal(document.activeElement,$('[data-leg="0"][data-key="to"]'));
});
const quoteCsv=(supplier,price)=>`airport,supplier,price_usd_per_t,valid_from,valid_until,delivery_basis,fees_included,source\nSIN,${supplier},${price},2026-01-01,2027-12-31,into-plane,true,Supplier document`;
const flushImport=()=>new Promise(resolve=>setImmediate(resolve));
function selectFile($,fire,file){Object.defineProperty($('#quote-file'),'files',{value:[file],configurable:true});fire('#quote-file','change');}
test("latest quotation file wins an out-of-order read",async t=>{
 const ui=await mount(t);const {$,fire,click,setRoute}=ui;setRoute(['SIN','BKK']);let finish;
 selectFile($,fire,{size:100,text:()=>new Promise(resolve=>{finish=resolve;})});
 selectFile($,fire,{size:100,text:async()=>quoteCsv('Latest supplier',900)});await flushImport();finish(quoteCsv('Older supplier',700));await flushImport();
 click('#mode-quotes');assert.equal($('[data-leg="0"][data-key="priceUsdPerT"]').value,'900');assert.equal($('#quote-count').textContent,'1');
 assert.match($('#import-feedback').textContent,/Imported 1 quotations/);
 click('#language-zh');assert.match($('#import-feedback').textContent,/已导入 1 条报价/);
 assert.equal($('[data-leg="0"][data-key="priceUsdPerT"]').value,'900');
 click('#language-en');assert.match($('#import-feedback').textContent,/Imported 1 quotations/);
});
test("clear cancels pending quotation reads",async t=>{
 const ui=await mount(t);const {$,fire,click}=ui;let finish;
 selectFile($,fire,{size:100,text:()=>new Promise(resolve=>{finish=resolve;})});click('#clear-quotes');finish(quoteCsv('Cancelled',700));await flushImport();
 assert.equal($('#quote-count').textContent,'0');assert.match($('#import-feedback').textContent,/Quotations cleared/);
});
test("emissions comparison resets with input changes",async t=>{
 const ui=await mount(t,{preset:'global'});const {$,input}=ui;
 assert.ok(Number($('#extra-co2').textContent)>=0);assert.match($('#carbon-threshold').textContent,/\$.*\/t CO₂|—/);
 input('[data-leg="0"][data-key="priceUsdPerT"]',1000);assert.equal($('#extra-co2').textContent,'—');assert.equal($('#carbon-threshold').textContent,'—');
});

test("invalid route guidance translates completely when the language changes",async t=>{
 const ui=await mount(t,{language:'zh'});const {$,setRoute,select,calculate,click,document,window}=ui;
 setRoute(['SIN','SIN']);calculate();
 assert.equal($('#model-error').textContent,'第 1 航段的起终点不能相同。');
 click('#language-en');assert.equal($('#model-error').textContent,'Leg 1: origin and destination must differ.');
 click('#language-zh');select('#aircraft','narrowbody');setRoute(['SIN','LHR']);calculate();
 assert.match($('#model-error').textContent,/第 1 航段超出该机型的适用范围/);
 assert.doesNotMatch($('#model-error').textContent,/[A-Za-z]/);
 click('#language-en');assert.match($('#model-error').textContent,/outside this aircraft profile.*adjust the route/);
 click('#language-zh');setRoute(['SIN','BKK']);
 document.dispatchEvent(new window.CustomEvent('scenarioassumptionschange',{detail:{options:{aircraft:{routeFactor:0.5}}}}));calculate();
 assert.equal($('#model-error').textContent,'无法生成第 1 航段的参数，请检查机型与价格假设。');
 click('#language-en');assert.equal($('#model-error').textContent,'Unable to generate inputs for leg 1. Check the aircraft and price assumptions.');
});
