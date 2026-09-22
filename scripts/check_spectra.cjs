// Numerical and SVG regression checks; no browser navigation is used.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'files/elements.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'files/viewer/index.html'),'utf8');
const experimentalFiles={Li:'Li_litio.csv',B:'B_boro.csv',K:'K_potassio.csv',Ca:'Ca_calcio.csv',Cu:'Cu_rame.csv',Sr:'Sr_stronzio.csv',Ba:'Ba_bario.csv'};
for(const [symbol,file] of Object.entries(experimentalFiles)){
  const rows=fs.readFileSync(path.join(root,'files/spectral_sources/definitivo',file),'utf8')
    .split(/\r?\n/).filter(line=>line&&!line.startsWith('#'));
  rows.shift();
  data.elements.find(element=>element.symbol===symbol).experimentalSpectrum=rows
    .map(row=>row.split(',').map(Number)).filter(([nm])=>nm>=380&&nm<=770);
}
const generatedHtml=fs.readFileSync(path.join(root,'output/flame_viewer.html'),'utf8');
const generatedData=JSON.parse(generatedHtml.match(/<script id="flame-data" type="application\/json">(.*?)<\/script>/s)[1]);
for(const element of generatedData.elements){
  assert.equal(Boolean(element.experimentalSpectrum?.length),Object.hasOwn(experimentalFiles,element.symbol));
}
assert(!html.includes('spectrum-species')&&!html.includes('<select')&&!html.includes('Dati spettrali'));
assert(html.includes('id="quick-mode"')&&html.includes('Modalità rapida'));
assert(html.includes('data-spectrum-mode="theoretical"')&&html.includes('data-spectrum-mode="experimental"'));
class Node {
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.style={setProperty(){}};this.value='all';this.textContent='';}
  setAttribute(k,v){this.attrs[k]=String(v);}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];this.value='all';}
  addEventListener(){}
  getBoundingClientRect(){return {width:width};}
  getScreenCTM(){return {inverse(){return this;}};}
  setPointerCapture(id){this.captured=id;}
  hasPointerCapture(id){return this.captured===id;}
  releasePointerCapture(){this.captured=null;}
}
let width=1000;
const nodes={};
const document={getElementById(id){return nodes[id]??=new Node(id);},querySelector(selector){return nodes[selector]??=new Node(selector);},createElementNS(ns,tag){return new Node(tag);},createElement(tag){return new Node(tag);}};
document.getElementById('flame-data').textContent=JSON.stringify(data);
const source=fs.readFileSync(path.join(root,'files/viewer/viewer.js'),'utf8');
assert(source.includes('startFlameColorTransition(previousColor,nextElement.color)'));
assert(source.includes('duration:BACKGROUND_TRANSITION_DURATION/1000'));
assert(source.includes('const target=fastRodOffsets()'));
assert(source.includes('geometry.x+geometry.radius*.65-geometry.sampleX'));
assert(source.includes('const ROD_ROTATION_DURATION=500'));
assert(source.includes('requestAnimationFrame(updateRodAngle)'));
assert(source.includes("setRodAngleTarget(rotate&&(drag||Math.hypot(rodOffsetX,rodOffsetY)>.5)?-30:0)"));
assert(source.includes('setRodPivotAtCursor(event.clientX,event.clientY)'));
assert(source.includes('drag={x:event.clientX,y:event.clientY,offsetX:rodOffsetX,offsetY:rodOffsetY};\n    setRodAngleTarget(-30);'));
assert(source.includes('setRodOffsetRaw(entryX,0,false)'));
assert(source.includes('animateRodTo(0,0,false)'));
assert(source.includes('animateRodTo(exitX,rodOffsetY,keepRotation)'));
assert(source.includes('const ROD_SWITCH_SPEED=1.43'));
assert(source.includes('startSpectrumMorph(previousElement,nextElement,spectrumMode,spectrumMode)'));
assert(source.includes('spectrumMorphSamples(spectrumMorph'));
assert(source.includes("'non ancora disponibile'"));
assert(!source.includes('startSpectrumSignalTransition'));
assert(!source.includes("svg.style.opacity='0'"));
assert(!source.includes('cloneNode(true)'));
const stop=source.indexOf('  for (const element of data.elements)');
assert(stop>0);
class DOMPoint {constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}}
const context={document,DOMPoint,URLSearchParams,location:{search:''},console};
vm.createContext(context);
vm.runInContext(source.slice(0,stop)+`globalThis.qa={componentSamples,componentValueAt,speciesLabel,spectralColor,drawSpectrum,adjacentElementSymbol,morphSamples(from,to,progress,fromMode='theoretical',toMode=fromMode){return spectrumMorphSamples({fromElement:elements.get(from),toElement:elements.get(to),fromMode,toMode,cache:new Map()},960,bounds,progress);},setElement(symbol,reveal=1){current=elements.get(symbol)||null;spectrumReveal=reveal;drawSpectrum();},setMode(mode){spectrumMode=mode;drawSpectrum();},setView(a,b){spectrumView=[a,b];drawSpectrum();}};})();`,context);
const qa=context.qa;
qa.setElement(null);assert.equal(qa.adjacentElementSymbol(1),data.elements[0].symbol);assert.equal(qa.adjacentElementSymbol(-1),data.elements.at(-1).symbol);
qa.setElement('Na');assert.equal(qa.adjacentElementSymbol(-1),'B');assert.equal(qa.adjacentElementSymbol(1),'K');
qa.setElement(data.elements[0].symbol);assert.equal(qa.adjacentElementSymbol(-1),data.elements.at(-1).symbol);
qa.setElement(data.elements.at(-1).symbol);assert.equal(qa.adjacentElementSymbol(1),data.elements[0].symbol);
assert(source.includes("event.repeat")&&source.includes("event.key==='ArrowUp'")&&source.includes("event.key==='ArrowDown'"));
{
  const start=qa.morphSamples('Li','Na',0),end=qa.morphSamples('Li','Na',1);
  const nearest=(points,nm)=>points.reduce((best,point)=>Math.abs(point[0]-nm)<Math.abs(best[0]-nm)?point:best);
  assert(nearest(start,670.78)[1]>nearest(end,670.78)[1]);
  assert(nearest(end,589)[1]>nearest(start,589)[1]);
}
function descend(node){return [node,...node.children.flatMap(descend)];}
for(width of [280,600,1200]){
  qa.setView(380,770);
  for(const element of data.elements){
    for(const reveal of [0,.5,1]){
      qa.setElement(element.symbol,reveal);
      const all=descend(nodes.spectrum);
      assert(!all.some(n=>/NaN|Infinity/.test(n.attrs.d||'')));
      assert(!all.some(n=>n.attrs['data-position-only']));
      const labels=all.filter(n=>n.tag==='text').map(n=>n.textContent);
      assert(!labels.includes('380')&&!labels.includes('770'));
      const traces=all.filter(n=>n.attrs['data-spectrum']==='combined');
      assert.equal(traces.length,element.spectral_components.some(c=>c.peaks.length)?1:0);
      const allCoords=[];
      for(const trace of traces){
        assert.equal(trace.attrs['stroke-width'],'1.2375');
        const coords=[...trace.attrs.d.matchAll(/([\d.e+-]+),([\d.e+-]+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
        assert(coords.every(([x,y])=>x>=20-1e-9&&x<=width-20+1e-9&&y>=27-1e-9&&y<=133+1e-9));
        allCoords.push(...coords);
      }
      if(traces.length){
        const title=traces[0].children.find(n=>n.tag==='title')?.textContent??'';
        assert(element.spectral_components.every(component=>title.includes(qa.speciesLabel(component.id))));
      }
      assert(Math.abs(Math.min(...allCoords.map(p=>p[1]))-(133-106*reveal))<1e-9);
    }
  }
  qa.setElement(null);
  assert(!descend(nodes.spectrum).some(n=>n.attrs['data-spectrum']==='combined'));
}
qa.setMode('experimental');
for(const symbol of Object.keys(experimentalFiles)){
  qa.setElement(symbol,1);
  const trace=descend(nodes.spectrum).find(n=>n.attrs['data-spectrum']==='combined');
  assert(trace&&trace.children.some(node=>node.tag==='title'&&node.textContent==='Spettro sperimentale'));
  assert(!descend(nodes.spectrum).some(node=>node.textContent==='non ancora disponibile'));
}
for(const symbol of ['Na','Fe','Rb','Cs']){
  qa.setElement(symbol,1);
  assert(descend(nodes.spectrum).some(node=>node.textContent==='non ancora disponibile'));
  assert(!descend(nodes.spectrum).some(node=>node.attrs['data-spectrum']==='combined'));
}
qa.setMode('theoretical');
qa.setElement('Fe',1);qa.setView(500,600);
{
  const trace=descend(nodes.spectrum).find(n=>n.attrs['data-spectrum']==='combined');
  const xs=[...trace.attrs.d.matchAll(/([\d.e+-]+),([\d.e+-]+)/g)].map(m=>Number(m[1]));
  assert(xs.every(x=>x>=20-1e-9&&x<=width-20+1e-9));
  assert(nodes.spectrum.attrs['aria-label'].includes('500.0-600.0 nm'));
}
qa.setView(380,770);
{
  const svg=nodes.spectrum;
  const event=(x,id=7)=>({button:0,pointerId:id,clientX:x,clientY:80,preventDefault(){}});
  svg.onpointerdown(event(220));
  svg.onpointermove(event(620));
  const guides=descend(svg).filter(n=>n.tag==='line'&&n.attrs.stroke==='#a8ceff');
  const shade=descend(svg).find(n=>n.attrs['data-zoom-selection']==='true');
  assert.equal(guides.length,2);
  assert(guides.every(line=>line.attrs.visibility!=='hidden'));
  assert.equal(shade.attrs.visibility,'visible');
  assert(Number(shade.attrs.width)>0&&Number(shade.attrs['fill-opacity'])>0);
  svg.onpointerup(event(620));
  assert(!svg.attrs['aria-label'].includes('380.0-770.0 nm'));
  svg.ondblclick({preventDefault(){}});
  assert(svg.attrs['aria-label'].includes('380.0-770.0 nm'));
}
qa.setElement('Li',1);
{
  const svg=nodes.spectrum;
  const cursorLabel=descend(svg).find(n=>n.tag==='text'&&n.attrs.y==='13');
  const x=nm=>20+(nm-380)/390*(width-40);
  svg.onpointermove({clientX:x(500),clientY:80});
  assert(cursorLabel.textContent.includes('500,0 nm'));
  assert(!cursorLabel.textContent.includes('Li I'));
  svg.onpointermove({clientX:x(670.78),clientY:80});
  assert(cursorLabel.textContent.includes('Li I'));
  assert(!cursorLabel.textContent.includes('%'));
}
// Exact centre retention and source strength ratios for isolated peaks.
const isolated={scale:1,peaks:[{nm:420.1792,strength:1,sigma_nm:.18},{nm:543.15321,strength:.2,sigma_nm:.18}]};
const points=qa.componentSamples(isolated,960);
assert.equal(points.find(p=>p[0]===420.1792)[1],1);
assert.equal(points.find(p=>p[0]===543.15321)[1],.2);
// Resolution does not depend on the viewport and close lines are never moved.
const close={scale:1,peaks:[{nm:670.7775,strength:1,sigma_nm:.18},{nm:670.7926,strength:.5,sigma_nm:.18}]};
for(const w of [240,960])for(const peak of close.peaks)assert(qa.componentSamples(close,w).some(p=>p[0]===peak.nm));
const rb=data.elements.find(e=>e.symbol==='Rb').spectral_components[0];
assert.equal(rb.peaks.length,30);
assert.equal(rb.markers.length,0);
assert(Math.abs(rb.peaks.find(p=>Math.abs(p.nm-421.5524)<1e-6).strength-.5)<1e-12);
assert(Math.abs(rb.peaks.find(p=>Math.abs(p.nm-629.83252)<1e-6).strength-.12)<1e-12);
assert(Math.abs(rb.peaks.find(p=>Math.abs(p.nm-761.8933)<1e-6).strength-.2)<1e-12);
assert(rb.peaks.every(p=>p.nm>=380&&p.nm<=770));
assert.equal(qa.spectralColor(380),'rgb(97,0,204)');
assert.equal(qa.spectralColor(440),'rgb(1,128,252)');
assert.equal(qa.spectralColor(580),'rgb(228,230,3)');
assert(/^rgb\((\d+),(\d+),(\d+)\)$/.test(qa.spectralColor(670)));
{
  const [r,g,b]=qa.spectralColor(670).match(/\d+/g).map(Number);
  assert(r>225&&g<35&&b<10);
}
assert.equal(qa.spectralColor(700),'rgb(229,1,2)');
assert.equal(qa.spectralColor(735),'rgb(229,1,2)');
assert.equal(qa.spectralColor(770),'rgb(229,1,2)');
assert.equal(data.spectralPalette.length,391);
for(const element of data.elements){
  const ascii=fs.readFileSync(path.join(root,'files/spectral_data_ascii',element.symbol+'_spectrum.txt'));
  assert([...ascii].every(byte=>byte<128));
  const rows=ascii.toString('ascii').split(/\r?\n/).filter(line=>line&&!line.startsWith('#'));
  const atomicRows=rows.filter(line=>line.startsWith(element.symbol+' I|'));
  assert(atomicRows.every(line=>Number(line.split('|')[4])>0));
  assert(rows.every(line=>line.split('|')[8]));
}
const ids=symbol=>data.elements.find(e=>e.symbol===symbol).spectral_components.map(c=>c.id);
assert(ids('Ca').includes('CaCl'));
assert(!ids('Cu').includes('CuCl')&&!ids('Sr').includes('SrCl')&&!ids('Ba').includes('BaCl'));
const component=(symbol,id)=>data.elements.find(e=>e.symbol===symbol).spectral_components.find(c=>c.id===id);
assert(component('Cs','Cs I').peaks.find(p=>Math.abs(p.nm-387.61486)<1e-6).strength > component('Cs','Cs I').peaks.find(p=>Math.abs(p.nm-672.32838)<1e-6).strength);
assert.equal(component('Fe','FeO').scale,1);
assert(qa.componentValueAt(component('Fe','FeO'),591)>qa.componentValueAt(component('Fe','Fe I'),591));
assert(qa.componentValueAt(component('Fe','Fe I'),387.8573)>qa.componentValueAt(component('Fe','FeO'),387.8573));
assert(component('Ba','BaO condensed').scale < component('Ba','BaOH').scale);
assert.equal(qa.speciesLabel('BaO gas'),'BaO');
assert.equal(qa.speciesLabel('BaO condensed'),'BaO');
// Save SVGs only when explicitly requested, for static visual review.
if(process.argv.includes('--svg')){
  const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const xml=n=>`<${n.tag} ${Object.entries(n.attrs).map(([k,v])=>`${k}="${escape(v)}"`).join(' ')}>${escape(n.textContent)}${n.children.map(xml).join('')}</${n.tag}>`;
  const dest=path.join(root,'tmp/spectral_qa');fs.mkdirSync(dest,{recursive:true});
  width=1000;
  for(const {symbol} of data.elements){
    qa.setElement(symbol);
    fs.writeFileSync(path.join(dest,symbol+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="148" viewBox="0 0 1000 148">${nodes.spectrum.children.map(xml).join('')}</svg>`);
  }
}
console.log('PASS: 11 elements, 3 widths, combined atomic/molecular spectra, reference colors, neutral return, positions, ratios and normalization.');
