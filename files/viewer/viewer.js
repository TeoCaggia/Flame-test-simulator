(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('flame-data').textContent);
  const byId = id => document.getElementById(id);
  const app = document.querySelector('.app');
  const loader=byId('viewer-loader');
  const elements = new Map(data.elements.map(element => [element.symbol, element]));
  byId('elements').style.setProperty('--element-count', data.elements.length);
  const query = new URLSearchParams(location.search);
  const requestedElement=elements.get(query.get('element'));
  const fallbackElement=elements.get(data.defaultElement)||data.elements[0];
  let current=requestedElement||null;
  const bounds = [380, 820];
  let spectrumView=[...bounds];
  let spectrumDrag=null;
  const spectrumTicks = [380,400,450,500,550,600,650,700,750,800,820];
  let time = 0;
  const glowNoiseSeed=Math.random()*1000;
  let selectionBusy=false;
  // Outside quick mode, an element change with the rod in the flame keeps the
  // coloured flame and its spectrum on the previous element until the rod
  // has come out and the colour has withdrawn (resolveColoredPlume).
  let flameHold=null;
  let quickMode=false;
  let reagentRevealFrame=null;
  let reagentCrossfadeTimer=null;
  let reagentVideoThumbnailIndex=0;
  let reagentTransitionToken=0;
  let reagentVideoFrameTimer=null;
  let spectrumMode='theoretical';
  const COLOR_FADE_DURATION=.5;
  let colorFadeStartedAt=null,colorFadeOutStartedAt=null,colorFadeOutFrom=0,colorFadeOutDuration=COLOR_FADE_DURATION;
  let spectrumReveal=0;
  let spectrumTarget=0;
  let spectrumTransition=null;
  let spectrumMorph=null;
  const SPECTRUM_REVEAL_DURATION=2/9;
  const SPECTRUM_HIDE_DURATION=2/9;
  const SPECTRUM_SAMPLES_PER_PIXEL=2;
  const ATOMIC_LINE_HALF_WIDTH_PX=.75;
  const ATOMIC_HOVER_SNAP_PX=9;
  const BACKGROUND_TRANSITION_DURATION=360;
  let flameColorTransition=null;
  const FLAME_HEIGHT_RATIO=.408;
  // The 3D framing is calibrated against the original 1536×1024 lab photograph.
  const REFERENCE_WIDTH=1536,REFERENCE_HEIGHT=1024;
  const BUNSEN_OPENING_SOURCE_Y=434/1024;
  const BUNSEN_BOTTOM_SOURCE_Y=760/1024;
  const svgNS = 'http://www.w3.org/2000/svg';
  const spectrumCache = new WeakMap();
  const combinedSpectrumCache = new WeakMap();
  function setSpectrumTarget(target){
    if(target===spectrumTarget)return;
    spectrumTarget=target;
    spectrumTransition={
      from:spectrumReveal,
      to:target,
      startedAt:time,
      duration:target>spectrumReveal?SPECTRUM_REVEAL_DURATION:SPECTRUM_HIDE_DURATION
    };
  }
  function svgNode(tag, attrs = {}, text) {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function spectralColor(nm) {
    if(nm>=750){
      const start=data.spectralPalette[750-380][1];
      const garnet=[111,20,43];
      const progress=Math.max(0,Math.min(1,(nm-750)/100));
      const color=start.map((value,index)=>Math.round(value+(garnet[index]-value)*progress));
      return `rgb(${color.join(',')})`;
    }
    const index=Math.max(0,Math.min(390,Math.round(nm)-380));
    return `rgb(${data.spectralPalette[index][1].join(',')})`;
  }

  const speciesLabel=id=>id.replace(/\s+(?:gas|condensed)$/i,'');
  const emissionSpeciesLabel=id=>{
    if(id==='BaO gas')return 'BaO (gas)';
    if(id==='BaO condensed')return 'BaO (condensato)';
    if(id==='SrO/Sr2O2')return 'SrO/Sr₂O₂ (assegnazione incerta)';
    return speciesLabel(id);
  };

  // Positions and widths are in nanometres, independent of window size.
  // Include each true centre so even unresolved/subpixel lines are not lost.
  function componentSamples(component,pixelWidth,view=bounds){
    let cache=spectrumCache.get(component);
    if(!cache){cache=new Map();spectrumCache.set(component,cache);}
    const cacheKey=`${pixelWidth}:${view[0]}:${view[1]}`;
    if(cache.has(cacheKey))return cache.get(cacheKey);
    const positions=new Set([view[0],view[1]]);
    const count=Math.ceil(pixelWidth*SPECTRUM_SAMPLES_PER_PIXEL);
    for(let i=0;i<=count;i++)positions.add(view[0]+(view[1]-view[0])*i/count);
    for(const peak of component.peaks){
      for(const offset of [-2,-1,0,1,2]){
        const nm=peak.nm+offset*peak.sigma_nm;
        if(nm>=view[0]&&nm<=view[1])positions.add(nm);
      }
    }
    const points=[...positions].sort((a,b)=>a-b).map(nm=>[nm,0]);
    const lowerBound=nm=>{
      let a=0,b=points.length;
      while(a<b){const m=(a+b)>>>1;if(points[m][0]<nm)a=m+1;else b=m;}
      return a;
    };
    for(const peak of component.peaks){
      const radius=6*peak.sigma_nm;
      for(let i=lowerBound(peak.nm-radius);i<points.length&&points[i][0]<=peak.nm+radius;i++){
        points[i][1]+=(component.scale??1)*peak.strength*Math.exp(-.5*((points[i][0]-peak.nm)/peak.sigma_nm)**2);
      }
    }
    cache.set(cacheKey,points);
    return points;
  }

  function combinedSamples(element,key,components,pixelWidth,view=bounds){
    let cache=combinedSpectrumCache.get(element);
    if(!cache){cache=new Map();combinedSpectrumCache.set(element,cache);}
    let profile=cache.get(key);
    if(!profile){
      profile={scale:1,peaks:components.flatMap(component=>component.peaks.map(peak=>({
        ...peak,strength:peak.strength*(component.scale??1)
      })))};
      cache.set(key,profile);
    }
    return componentSamples(profile,pixelWidth,view);
  }

  function theoreticalMaximum(element,molecularPoints,view=bounds){
    const molecularMaximum=molecularPoints.reduce((highest,point)=>Math.max(highest,point[1]),0);
    const impulses=new Map();
    for(const component of element.spectral_components.filter(component=>component.kind==='atomic')){
      for(const peak of component.peaks){
        if(peak.nm<view[0]||peak.nm>view[1])continue;
        impulses.set(peak.nm,(impulses.get(peak.nm)??0)+(component.scale??1)*peak.strength);
      }
    }
    const atomicMaximum=[...impulses].reduce((highest,[nm,value])=>
      Math.max(highest,valueAtPoints(molecularPoints,nm)+value),0);
    return Math.max(molecularMaximum,atomicMaximum);
  }

  function theoreticalSamples(element,pixelWidth,view=bounds){
    const molecularComponents=element.spectral_components.filter(component=>component.kind!=='atomic');
    const molecularPoints=combinedSamples(element,'molecular',molecularComponents,pixelWidth,view);
    const maximum=theoreticalMaximum(element,molecularPoints,view);
    if(maximum<=0)return molecularPoints.map(([nm])=>[nm,0]);
    const impulses=new Map();
    for(const component of element.spectral_components.filter(component=>component.kind==='atomic')){
      for(const peak of component.peaks){
        if(peak.nm<view[0]||peak.nm>view[1])continue;
        impulses.set(peak.nm,(impulses.get(peak.nm)??0)+(component.scale??1)*peak.strength);
      }
    }
    const halfWidth=(view[1]-view[0])/Math.max(1,pixelWidth)*ATOMIC_LINE_HALF_WIDTH_PX;
    const linePositions=[...impulses.keys()];
    const points=molecularPoints
      .filter(([nm])=>!linePositions.some(lineNm=>Math.abs(nm-lineNm)<halfWidth))
      .map(([nm,value])=>({nm,value,order:0}));
    for(const [nm,intensity] of impulses){
      const left=Math.max(view[0],nm-halfWidth);
      const right=Math.min(view[1],nm+halfWidth);
      points.push(
        {nm:left,value:valueAtPoints(molecularPoints,left),order:1},
        {nm,value:valueAtPoints(molecularPoints,nm)+intensity,order:2},
        {nm:right,value:valueAtPoints(molecularPoints,right),order:3}
      );
    }
    return points
      .sort((a,b)=>a.nm-b.nm||a.order-b.order)
      .map(point=>[point.nm,point.value/maximum]);
  }

  function componentValueAt(component,nm,atomicTolerance=.05){
    if(component.kind==='atomic'){
      return component.peaks.reduce((value,peak)=>
        Math.abs(nm-peak.nm)<=atomicTolerance
          ?value+(component.scale??1)*peak.strength*(1-Math.abs(nm-peak.nm)/atomicTolerance)
          :value,0);
    }
    let value=0;
    for(const peak of component.peaks){
      const distance=Math.abs(nm-peak.nm);
      if(distance<=6*peak.sigma_nm){
        value+=(component.scale??1)*peak.strength*Math.exp(-.5*(distance/peak.sigma_nm)**2);
      }
    }
    return value;
  }

  function valueAtPoints(points,nm){
    if(!points.length)return 0;
    let low=0,high=points.length-1;
    while(low<high){const middle=(low+high)>>>1;if(points[middle][0]<nm)low=middle+1;else high=middle;}
    if(points[low][0]===nm||low===0)return points[low][1];
    const before=points[low-1],after=points[low];
    const ratio=(nm-before[0])/(after[0]-before[0]);
    return before[1]+(after[1]-before[1])*ratio;
  }

  function spectrumSamples(element,mode,pixelWidth,view){
    if(!element)return [[view[0],0],[view[1],0]];
    let points;
    let minimum=0;
    if(mode==='experimental'){
      const source=element.experimentalSpectrum;
      if(!source?.length)return [];
      points=[
        [view[0],valueAtPoints(source,view[0])],
        ...source.filter(([nm])=>nm>view[0]&&nm<view[1]),
        [view[1],valueAtPoints(source,view[1])]
      ];
      minimum=points.reduce((lowest,point)=>Math.min(lowest,point[1]),Infinity);
    }else{
      return theoreticalSamples(element,pixelWidth,view);
    }
    const maximum=points.reduce((highest,point)=>Math.max(highest,point[1]),-Infinity);
    const range=maximum-minimum;
    return range>0?points.map(([nm,value])=>[nm,(value-minimum)/range]):points.map(([nm])=>[nm,0]);
  }

  const spectrumAvailable=(element,mode)=>Boolean(
    element&&(mode==='theoretical'||element.experimentalSpectrum?.length)
  );

  function spectrumMorphSamples(morph,pixelWidth,view,progress){
    const key=`${pixelWidth}:${view[0]}:${view[1]}`;
    let base=morph.cache.get(key);
    if(!base){
      const from=spectrumSamples(morph.fromElement,morph.fromMode,pixelWidth,view);
      const to=spectrumSamples(morph.toElement,morph.toMode,pixelWidth,view);
      const positions=[...new Set([...from.map(point=>point[0]),...to.map(point=>point[0])])].sort((a,b)=>a-b);
      base=positions.map(nm=>[nm,valueAtPoints(from,nm),valueAtPoints(to,nm)]);
      morph.cache.set(key,base);
    }
    return base.map(([nm,from,to])=>[nm,from+(to-from)*progress]);
  }

  function startSpectrumMorph(fromElement,toElement,fromMode=spectrumMode,toMode=spectrumMode){
    if(!spectrumAvailable(fromElement,fromMode)||!spectrumAvailable(toElement,toMode)){
      spectrumMorph=null;
      drawSpectrum();
      return;
    }
    spectrumMorph={fromElement,toElement,fromMode,toMode,startedAt:time,duration:BACKGROUND_TRANSITION_DURATION/1000,cache:new Map()};
    drawSpectrum();
  }

  function drawSpectrum() {
    const shown=flameHold??current;
    const svg = byId('spectrum');
    svg.replaceChildren();
    const width = Math.max(280, svg.getBoundingClientRect().width);
    svg.setAttribute('viewBox', `0 0 ${width} 148`);
    const left = 20, right = width - 20, top = 20, baseline = 133;
    const viewStart=spectrumView[0],viewEnd=spectrumView[1],viewRange=viewEnd-viewStart;
    const x = nm => left + (nm - viewStart) / viewRange * (right-left);
    svg.append(svgNode('rect', {x:left,y:top,width:right-left,height:baseline-top,fill:'#02020e',stroke:'#2a2a44','stroke-width':1}));
    const defs=svgNode('defs');
    const spectrumGradient=svgNode('linearGradient',{id:'visible-spectrum',gradientUnits:'userSpaceOnUse',x1:left,x2:right,y1:0,y2:0});
    for(let nm=Math.floor(viewStart);nm<=Math.ceil(viewEnd);nm++){
      const wavelength=Math.max(viewStart,Math.min(viewEnd,nm));
      spectrumGradient.append(svgNode('stop',{offset:`${(wavelength-viewStart)/viewRange*100}%`,'stop-color':spectralColor(wavelength)}));
    }
    defs.append(spectrumGradient);svg.append(defs);
    for (const nm of spectrumTicks) {
      if(nm<viewStart||nm>viewEnd)continue;
      svg.append(svgNode('line', {x1:x(nm),x2:x(nm),y1:top,y2:baseline,stroke:'#2a2a44','stroke-opacity':.72,'stroke-width':1}));
      if(nm!==bounds[0]&&nm!==bounds[1]){
        svg.append(svgNode('text', {x:x(nm),y:146,class:'spectrum-axis-label','text-anchor':'middle'}, String(nm)));
      }
    }
    // No fabricated wavelength-dependent continuum underneath the emissions.
    const background = () => 0;
    if(!shown){
      const baselinePoints=[];
      const samples=Math.ceil((right-left)*SPECTRUM_SAMPLES_PER_PIXEL);
      for(let step=0;step<=samples;step++){
        const px=left+(right-left)*step/samples;
        const nm=bounds[0]+(px-left)/(right-left)*(bounds[1]-bounds[0]);
        baselinePoints.push(`${px},${baseline-background(nm)}`);
      }
      svg.append(svgNode('path',{d:`M ${baselinePoints.join(' L ')}`,fill:'none',stroke:'url(#visible-spectrum)','stroke-width':1.2375,'stroke-linejoin':'round','stroke-linecap':'round'}));
      svg.onpointermove=null;
      svg.onpointerleave=null;
      svg.onpointerdown=null;
      svg.onpointerup=null;
      svg.onpointercancel=null;
      svg.ondblclick=null;
      svg.setAttribute('aria-label','Spettro vuoto; nessun elemento selezionato.');
      return;
    }
    if(!spectrumAvailable(shown,spectrumMode)){
      svg.append(svgNode('text',{x:(left+right)/2,y:(top+baseline)/2+4,class:'spectrum-unavailable','text-anchor':'middle'},'non ancora disponibile'));
      svg.onpointermove=null;
      svg.onpointerleave=null;
      svg.onpointerdown=null;
      svg.onpointerup=null;
      svg.onpointercancel=null;
      svg.ondblclick=null;
      svg.setAttribute('aria-label',`Spettro sperimentale di ${shown.name}: non ancora disponibile.`);
      return;
    }
    const components=shown.spectral_components;
    const morphProgress=spectrumMorph?Math.max(0,Math.min(1,(time-spectrumMorph.startedAt)/spectrumMorph.duration)):null;
    const easedMorph=morphProgress===null?null:morphProgress*morphProgress*(3-2*morphProgress);
    const points=spectrumMorph
      ?spectrumMorphSamples(spectrumMorph,right-left,spectrumView,easedMorph)
      :spectrumSamples(shown,spectrumMode,right-left,spectrumView);
    const signalMaximum=points.reduce((maximum,point)=>Math.max(maximum,point[1]),0);
    const signalHeight=baseline-top-7;
    // Samples are already normalized against the complete spectrum. Keeping a
    // fixed scale preserves the relative height of molecular bands and sticks.
    const signalScale=signalHeight;
    if(signalMaximum>0){
      const tracePoints=points.map(([nm,value])=>`${x(nm)},${baseline-signalScale*value*spectrumReveal}`);
      const trace=svgNode('path',{d:`M ${tracePoints.join(' L ')}`,fill:'none',stroke:'url(#visible-spectrum)','stroke-width':1.2375,'stroke-linejoin':'round','stroke-linecap':'round','data-spectrum':'combined'});
      trace.append(svgNode('title',{},spectrumMode==='theoretical'
        ?[...new Set(components.map(component=>speciesLabel(component.id)))].join(', ')
        :'Spettro sperimentale'));
      svg.append(trace);
    }else if(spectrumMode==='theoretical'){
      const zeroLine=svgNode('line',{
        x1:left,x2:right,y1:baseline,y2:baseline,
        stroke:'url(#visible-spectrum)','stroke-width':1.2375,'stroke-linecap':'round',
        'data-spectrum':'zero-line'
      });
      zeroLine.append(svgNode('title',{},'Linea di base dello spettro teorico'));
      svg.append(zeroLine);
    }
    const summary=spectrumMode==='theoretical'
      ?components.map(c=>`${speciesLabel(c.id)}: ${c.peaks.length} ${c.kind==='atomic'?'righe ideali':'bande'}`).join('; ')
      :`${shown.experimentalSpectrum.length} misure sperimentali`;
    const selectionShade=svgNode('rect',{x:left,y:top,width:0,height:baseline-top,fill:'#a8ceff','fill-opacity':.10,'visibility':'hidden','pointer-events':'none','data-zoom-selection':'true'});
    const cursor=svgNode('g',{'visibility':'hidden','pointer-events':'none','aria-hidden':'true'});
    const selectionStartLine=svgNode('line',{y1:top,y2:baseline,stroke:'#a8ceff','stroke-opacity':'.62','stroke-width':1,'visibility':'hidden','pointer-events':'none'});
    const cursorLine=svgNode('line',{y1:top,y2:baseline,stroke:'#a8ceff','stroke-opacity':'.62','stroke-width':1});
    const cursorPoint=svgNode('circle',{r:3.5,stroke:'#fff','stroke-width':1.5});
    const cursorLabel=svgNode('text',{y:13,class:'spectrum-cursor-label','text-anchor':'middle'});
    cursor.append(cursorLine,cursorPoint,cursorLabel);
    svg.append(selectionShade,selectionStartLine,cursor);
    const eventPoint=event=>{
      const matrix=svg.getScreenCTM();
      if(!matrix)return null;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
      return point;
    };
    const wavelengthAt=point=>viewStart+(Math.max(left,Math.min(right,point.x))-left)/(right-left)*viewRange;
    svg.onpointermove=spectrumReveal>.01?event=>{
      const point=eventPoint(event);
      if(!point)return;
      if(point.x<left||point.x>right||point.y<0||point.y>baseline){
        if(!spectrumDrag)cursor.setAttribute('visibility','hidden');
        return;
      }
      let nm=wavelengthAt(point);
      let cursorX=point.x;
      if(!spectrumDrag&&spectrumMode==='theoretical'){
        let nearestLine=null;
        let nearestDistance=Infinity;
        for(const component of components.filter(component=>component.kind==='atomic')){
          for(const peak of component.peaks){
            if(peak.nm<viewStart||peak.nm>viewEnd||(component.scale??1)*peak.strength<=0)continue;
            const distance=Math.abs(x(peak.nm)-point.x);
            if(distance<nearestDistance){nearestLine=peak;nearestDistance=distance;}
          }
        }
        if(nearestLine&&nearestDistance<=ATOMIC_HOVER_SNAP_PX){
          nm=nearestLine.nm;
          cursorX=x(nm);
        }
      }
      if(spectrumDrag){
        selectionShade.setAttribute('x',Math.min(spectrumDrag.x,point.x));
        selectionShade.setAttribute('width',Math.abs(point.x-spectrumDrag.x));
        selectionShade.setAttribute('visibility','visible');
      }
      cursorLine.setAttribute('x1',cursorX);
      cursorLine.setAttribute('x2',cursorX);
      cursorPoint.setAttribute('cx',cursorX);
      cursorPoint.setAttribute('cy',baseline-signalScale*valueAtPoints(points,nm)*spectrumReveal);
      cursorPoint.setAttribute('fill',spectralColor(nm));
      cursorLabel.setAttribute('x',Math.max(left+30,Math.min(right-30,cursorX)));
      const atomicTolerance=viewRange/(right-left)*ATOMIC_LINE_HALF_WIDTH_PX;
      const contributions=components.map(component=>{
        return {
          label:emissionSpeciesLabel(component.id),
          value:componentValueAt(component,nm,atomicTolerance)
        };
      }).filter(item=>item.value>1e-8).sort((a,b)=>b.value-a.value);
      const origins=[...new Set(contributions.filter((item,index)=>index<2&&item.value>=contributions[0].value*.05)
        .map(item=>item.label))].join(' · ');
      cursorLabel.textContent=spectrumDrag
        ?`${Math.min(spectrumDrag.nm,nm).toLocaleString('it-IT',{maximumFractionDigits:1})}–${Math.max(spectrumDrag.nm,nm).toLocaleString('it-IT',{maximumFractionDigits:1})} nm`
        :`${nm.toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})} nm${origins?' · '+origins:''}`;
      cursor.setAttribute('visibility','visible');
    }:null;
    svg.onpointerdown=event=>{
      if(event.button!==0||spectrumReveal<=.01)return;
      const point=eventPoint(event);
      if(!point||point.x<left||point.x>right||point.y<top||point.y>baseline)return;
      event.preventDefault();
      spectrumDrag={pointerId:event.pointerId,nm:wavelengthAt(point),x:point.x};
      selectionStartLine.setAttribute('x1',point.x);selectionStartLine.setAttribute('x2',point.x);
      selectionStartLine.setAttribute('visibility','visible');
      selectionShade.setAttribute('x',point.x);selectionShade.setAttribute('width',0);
      selectionShade.setAttribute('visibility','visible');
      cursorLine.setAttribute('x1',point.x);cursorLine.setAttribute('x2',point.x);
      cursorPoint.setAttribute('cx',point.x);
      cursorPoint.setAttribute('cy',baseline-signalScale*valueAtPoints(points,spectrumDrag.nm)*spectrumReveal);
      cursorPoint.setAttribute('fill',spectralColor(spectrumDrag.nm));
      cursor.setAttribute('visibility','visible');
      svg.setPointerCapture?.(event.pointerId);
    };
    svg.onpointerup=event=>{
      if(!spectrumDrag||event.pointerId!==spectrumDrag.pointerId)return;
      const point=eventPoint(event);
      const endNm=point?wavelengthAt(point):spectrumDrag.nm;
      const enough=Math.abs(endNm-spectrumDrag.nm)>=viewRange*5/(right-left);
      if(svg.hasPointerCapture?.(event.pointerId))svg.releasePointerCapture(event.pointerId);
      const startNm=spectrumDrag.nm;
      spectrumDrag=null;
      if(enough){spectrumView=[Math.min(startNm,endNm),Math.max(startNm,endNm)];drawSpectrum();}
      else{selectionStartLine.setAttribute('visibility','hidden');selectionShade.setAttribute('visibility','hidden');}
    };
    svg.onpointercancel=event=>{
      if(!spectrumDrag||event.pointerId!==spectrumDrag.pointerId)return;
      spectrumDrag=null;selectionShade.setAttribute('visibility','hidden');selectionStartLine.setAttribute('visibility','hidden');cursor.setAttribute('visibility','hidden');
    };
    svg.onpointerleave=()=>{if(!spectrumDrag)cursor.setAttribute('visibility','hidden');};
    svg.ondblclick=event=>{event.preventDefault();spectrumDrag=null;spectrumView=[...bounds];drawSpectrum();};
    svg.setAttribute('aria-label', `${spectrumMode==='theoretical'?'Spettro teorico qualitativo':'Spettro sperimentale'} di ${shown.name}, intervallo ${viewStart.toFixed(1)}-${viewEnd.toFixed(1)} nm: ${summary}. Trascina per ingrandire; doppio clic per ripristinare.${spectrumMode==='theoretical'?' '+data.spectralMethod:''}`);
  }

  function adjacentElementSymbol(direction){
    if(!current)return direction>0?data.elements[0]?.symbol:data.elements.at(-1)?.symbol;
    const index=data.elements.findIndex(element=>element.symbol===current.symbol);
    return data.elements[(index+direction+data.elements.length)%data.elements.length]?.symbol??null;
  }

  for (const element of data.elements) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'element';
    button.dataset.symbol = element.symbol;
    button.style.setProperty('--element-color', element.color);
    button.style.setProperty('--element-index', byId('elements').children.length);
    button.setAttribute('aria-label', `${element.name}, ${element.symbol}, numero atomico ${element.number}`);
    const tile = document.createElement('span'); tile.className='tile';
    const symbol = document.createElement('strong'); symbol.className='element-symbol'; symbol.textContent=element.symbol;
    tile.append(symbol);
    const name=document.createElement('span'); name.className='element-name'; name.textContent=element.name;
    button.append(tile,name);
    button.addEventListener('click', () => selectElement(element.symbol));
    byId('elements').append(button);
  }

  document.addEventListener('keydown',event=>{
    if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    const direction=event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0;
    if(!direction||selectionBusy)return;
    const symbol=adjacentElementSymbol(direction);
    if(!symbol)return;
    event.preventDefault();
    [...byId('elements').children]
      .find(button=>button.dataset.symbol===symbol)
      ?.focus({preventScroll:true});
    selectElement(symbol);
  });

  function hideReagentVideoFrame(animate=true){
    const frame=byId('reagent-video-frame');
    if(reagentVideoFrameTimer!==null){
      clearTimeout(reagentVideoFrameTimer);
      reagentVideoFrameTimer=null;
    }
    const clear=()=>{
      frame.classList.remove('is-visible');
      const context=frame.getContext('2d');
      context?.clearRect(0,0,frame.width,frame.height);
    };
    if(!animate){clear();return;}
    frame.classList.remove('is-visible');
    reagentVideoFrameTimer=setTimeout(()=>{
      clear();
      reagentVideoFrameTimer=null;
    },BACKGROUND_TRANSITION_DURATION+80);
  }

  function captureReagentVideoFrame(video){
    if(!video.classList.contains('is-playing')||video.readyState<2||!video.videoWidth||!video.videoHeight)return false;
    const frame=byId('reagent-video-frame');
    const shell=byId('reagent-panel');
    const pixelRatio=Math.min(1.5,window.devicePixelRatio||1);
    const width=Math.max(1,Math.round(shell.clientWidth*pixelRatio));
    const height=Math.max(1,Math.round(shell.clientHeight*pixelRatio));
    frame.width=width;
    frame.height=height;
    const sourceRatio=video.videoWidth/video.videoHeight;
    const targetRatio=width/height;
    let sourceX=0,sourceY=0,sourceWidth=video.videoWidth,sourceHeight=video.videoHeight;
    if(sourceRatio>targetRatio){
      sourceWidth=video.videoHeight*targetRatio;
      sourceX=(video.videoWidth-sourceWidth)/2;
    }else{
      sourceHeight=video.videoWidth/targetRatio;
      sourceY=(video.videoHeight-sourceHeight)/2;
    }
    frame.getContext('2d').drawImage(video,sourceX,sourceY,sourceWidth,sourceHeight,0,0,width,height);
    video.pause();
    frame.classList.add('is-visible');
    void frame.offsetWidth;
    return true;
  }

  function clearReagentVideo(preserveFrame=false){
    const video=byId('reagent-video');
    const framePreserved=preserveFrame&&captureReagentVideoFrame(video);
    if(!framePreserved)hideReagentVideoFrame(false);
    video.pause();
    video.loop=false;
    video.muted=false;
    video.classList.remove('is-playing');
    video.removeAttribute('src');
    video.removeAttribute('aria-label');
    video.dataset.symbol='';
    video.load();
    byId('reagent-video-play').classList.remove('is-hidden');
    return framePreserved;
  }

  function clearReagentVideoFrameAfterTransition(){
    const transitionToken=reagentTransitionToken;
    if(reagentVideoFrameTimer!==null)clearTimeout(reagentVideoFrameTimer);
    reagentVideoFrameTimer=setTimeout(()=>{
      if(transitionToken===reagentTransitionToken)hideReagentVideoFrame(false);
      reagentVideoFrameTimer=null;
    },BACKGROUND_TRANSITION_DURATION+80);
  }

  function settleVideoThumbnailCrossfade(){
    const thumbnails=[byId('reagent-video-thumbnail'),byId('reagent-video-thumbnail-next')];
    const incomingIndex=thumbnails.findIndex(thumbnail=>
      thumbnail.classList.contains('is-incoming')&&thumbnail.classList.contains('is-active')
    );
    if(incomingIndex>=0)reagentVideoThumbnailIndex=incomingIndex;
    thumbnails.forEach((thumbnail,index)=>{
      thumbnail.classList.remove('is-incoming');
      thumbnail.classList.toggle('is-active',index===reagentVideoThumbnailIndex&&thumbnail.hasAttribute('src'));
    });
  }

  const REAGENT_PANEL_STATES=['has-video','has-video-unavailable'];
  function setReagentPanelState(visibleClass,onReveal){
    const panel=byId('reagent-panel');
    const previousClass=REAGENT_PANEL_STATES.find(state=>panel.classList.contains(state));
    const transitionToken=reagentTransitionToken;
    panel.classList.remove(...REAGENT_PANEL_STATES);
    const reveal=()=>{
      if(transitionToken!==reagentTransitionToken)return;
      panel.classList.add(visibleClass);
      onReveal?.();
    };
    if(previousClass&&previousClass!==visibleClass){
      reagentRevealFrame=requestAnimationFrame(()=>{
        reagentRevealFrame=requestAnimationFrame(()=>{
          reagentRevealFrame=null;
          reveal();
        });
      });
    }else reveal();
  }

  function showElementVideo(){
    const panel=byId('reagent-panel');
    const video=byId('reagent-video');
    const thumbnails=[byId('reagent-video-thumbnail'),byId('reagent-video-thumbnail-next')];
    const playButton=byId('reagent-video-play');
    const framePreserved=clearReagentVideo(true);
    if(!current?.videoSource){
      for(const thumbnail of thumbnails)thumbnail.alt='';
      setReagentPanelState('has-video-unavailable');
      if(framePreserved)clearReagentVideoFrameAfterTransition();
      return;
    }
    const alt=`Fotogramma della prova alla fiamma del ${current.name.toLowerCase()}`;
    video.setAttribute('aria-label',`Video della prova alla fiamma del ${current.name.toLowerCase()}`);
    playButton.setAttribute('aria-label',`Riproduci il video del ${current.name.toLowerCase()}`);
    if(framePreserved&&panel.classList.contains('has-video')){
      const outgoing=thumbnails[reagentVideoThumbnailIndex];
      const incomingIndex=1-reagentVideoThumbnailIndex;
      const incoming=thumbnails[incomingIndex];
      outgoing.classList.remove('is-active','is-incoming');
      incoming.classList.remove('is-incoming');
      incoming.src=current.videoThumbnail;
      incoming.alt=alt;
      const revealThumbnail=()=>{
        incoming.style.transition='none';
        incoming.classList.add('is-active');
        void incoming.offsetWidth;
        incoming.style.removeProperty('transition');
        outgoing.classList.remove('is-active');
        outgoing.removeAttribute('src');
        outgoing.alt='';
        reagentVideoThumbnailIndex=incomingIndex;
        if(!quickMode)requestAnimationFrame(()=>hideReagentVideoFrame(true));
      };
      if(incoming.complete)revealThumbnail();
      else{
        incoming.onload=revealThumbnail;
        incoming.onerror=revealThumbnail;
      }
      return;
    }
    if(panel.classList.contains('has-video')&&thumbnails[reagentVideoThumbnailIndex].classList.contains('is-active')){
      const transitionToken=reagentTransitionToken;
      const outgoing=thumbnails[reagentVideoThumbnailIndex];
      const incomingIndex=1-reagentVideoThumbnailIndex;
      const incoming=thumbnails[incomingIndex];
      incoming.classList.remove('is-active');
      incoming.classList.add('is-incoming');
      incoming.src=current.videoThumbnail;
      incoming.alt=alt;
      const startCrossfade=()=>{
        if(transitionToken!==reagentTransitionToken)return;
        reagentRevealFrame=requestAnimationFrame(()=>{
          reagentRevealFrame=null;
          incoming.classList.add('is-active');
          outgoing.classList.remove('is-active');
          if(framePreserved&&!quickMode)hideReagentVideoFrame(true);
          const finish=()=>{
            if(transitionToken!==reagentTransitionToken)return;
            reagentVideoThumbnailIndex=incomingIndex;
            incoming.classList.remove('is-incoming');
            outgoing.alt='';
          };
          reagentCrossfadeTimer=setTimeout(finish,BACKGROUND_TRANSITION_DURATION+80);
        });
      };
      if(incoming.complete)startCrossfade();
      else{
        incoming.onload=startCrossfade;
        incoming.onerror=startCrossfade;
      }
      return;
    }
    const thumbnail=thumbnails[reagentVideoThumbnailIndex];
    thumbnail.src=current.videoThumbnail;
    thumbnail.alt=alt;
    setReagentPanelState('has-video');
    thumbnail.classList.add('is-active');
    if(framePreserved&&!quickMode)hideReagentVideoFrame(true);
  }

  function resetReagentPanel(){
    reagentTransitionToken++;
    if(reagentRevealFrame!==null){
      cancelAnimationFrame(reagentRevealFrame);
      reagentRevealFrame=null;
    }
    if(reagentCrossfadeTimer!==null){
      clearTimeout(reagentCrossfadeTimer);
      reagentCrossfadeTimer=null;
    }
    settleVideoThumbnailCrossfade();
    document.querySelector('.reagent-placeholder').textContent='';
    showElementVideo();
  }

  async function playCurrentVideo(automatic=false){
    const video=byId('reagent-video');
    if(!current?.videoSource)return;
    video.loop=quickMode;
    video.muted=automatic;
    if(automatic)byId('reagent-video-play').classList.add('is-hidden');
    if(video.dataset.symbol!==current.symbol){
      video.dataset.symbol=current.symbol;
      video.src=current.videoSource;
      video.setAttribute('aria-label',`Video della prova alla fiamma del ${current.name.toLowerCase()}`);
    }
    try{await video.play();}
    catch{byId('reagent-video-play').classList.remove('is-hidden');}
  }
  byId('reagent-video-play').addEventListener('click',()=>{
    playCurrentVideo(false);
  });
  byId('reagent-video').addEventListener('playing',event=>{
    event.currentTarget.classList.add('is-playing');
    byId('reagent-video-play').classList.add('is-hidden');
    if(byId('reagent-video-frame').classList.contains('is-visible')){
      requestAnimationFrame(()=>hideReagentVideoFrame(true));
    }
  });
  byId('reagent-video').addEventListener('click',event=>{
    const video=event.currentTarget;
    if(video.paused||video.ended||!video.classList.contains('is-playing'))return;
    video.pause();
    byId('reagent-video-play').classList.remove('is-hidden');
  });
  byId('reagent-video').addEventListener('ended',event=>{
    event.currentTarget.currentTime=0;
    if(quickMode&&current?.videoSource&&event.currentTarget.dataset.symbol===current.symbol){
      event.currentTarget.play().catch(()=>byId('reagent-video-play').classList.remove('is-hidden'));
      return;
    }
    event.currentTarget.classList.remove('is-playing');
    byId('reagent-video-play').classList.remove('is-hidden');
  });
  byId('reagent-video').addEventListener('error',()=>{
    const video=byId('reagent-video');
    if(!video.getAttribute('src')||video.dataset.symbol!==current?.symbol)return;
    const framePreserved=captureReagentVideoFrame(video);
    setReagentPanelState('has-video-unavailable');
    if(framePreserved)clearReagentVideoFrameAfterTransition();
  });

  function startFlameColorTransition(fromColor,toColor){
    flameColorTransition={from:colorVector(fromColor),to:colorVector(toColor),startedAt:time,duration:BACKGROUND_TRANSITION_DURATION/1000};
  }

  function applyElement(element,preserveActiveFlame=false) {
    current=element;
    syncBunsen3D();
    if(preserveActiveFlame){
      spectrumReveal=1;
      spectrumTarget=1;
      spectrumTransition=null;
    }else if(!flameHold){
      flameColorTransition=null;
      colorFadeStartedAt=null;
      spectrumReveal=0;
      spectrumTarget=0;
      spectrumTransition=null;
      resetColoredPlume();
    }
    resetReagentPanel();
    byId('spectrum-note-title').textContent='Descrizione';
    byId('spectrum-description').textContent=current.spectrumDescription;
    byId('flame').setAttribute('aria-label', `Fiamma ${current.colorName.toLowerCase()} del ${current.name.toLowerCase()}; rappresentazione qualitativa`);
    for (const button of byId('elements').children) button.setAttribute('aria-pressed', String(button.dataset.symbol===current.symbol));
    drawSpectrum();
    render();
  }

  async function selectElement(symbol) {
    if(!elements.has(symbol))throw new RangeError(`Unknown element: ${symbol}`);
    if(selectionBusy||rodReturning||!bunsenScene||sceneFailed)return;
    selectionBusy=true;
    byId('quick-mode').disabled=true;
    syncBunsen3D();
    try{
      const previous=current;
      if(previous?.symbol===symbol){
        await bunsenScene.moveToRest();
        await bunsenScene.transitionElement(null,()=>{
          resetColoredPlume();initializeNeutralState();
        });
      }else{
        const next=elements.get(symbol);
        // Outside quick mode the rod samples the salt from the jar on the bench.
        const dip=!quickMode;
        if(dip)bunsenScene.holdBead();
        if(dip&&previous&&(sampleIsInsideFlame()||lastColoredSample))flameHold=previous;
        // Timed against the jars as they are now, so it starts first: the rod
        // waits where it is and reaches the jar as its cork comes off.
        const dipping=dip?bunsenScene.dipRod(next):Promise.resolve();
        await Promise.all([dipping,bunsenScene.transitionElement(next,()=>{
          if(quickMode&&previous)startFlameColorTransition(previous.color,next.color);
          applyElement(next,quickMode&&Boolean(previous));
          if(quickMode){
            playCurrentVideo(true);
            startSpectrumMorph(previous,next,spectrumMode,spectrumMode);
          }
        })]);
        if(quickMode&&!previous)await bunsenScene.moveToFlame();
      }
      render();
    }finally{
      if(flameHold)releaseFlameHold();
      selectionBusy=false;
      byId('quick-mode').disabled=false;
      syncBunsen3D();
    }
  }

  function initializeNeutralState(){
    current=null;
    syncBunsen3D();
    spectrumReveal=0;
    spectrumTarget=0;
    spectrumTransition=null;
    byId('flame').setAttribute('aria-label','Fiamma a butano; nessun elemento selezionato');
    byId('reagent-panel').classList.remove('has-video','has-video-unavailable');
    clearReagentVideo();
    document.querySelector('.reagent-placeholder').textContent='Scegli un elemento';
    byId('spectrum-note-title').textContent='Descrizione';
    byId('spectrum-description').textContent='Seleziona un elemento per leggere la descrizione del suo spettro.';
    for(const button of byId('elements').children)button.setAttribute('aria-pressed','false');
    resetColoredPlume();
    drawSpectrum();
    render();
  }

  const canvas=byId('flame');
  const stage=canvas.parentElement;
  const sceneCanvas=byId('bunsen-scene');
  let bunsenScene=null,sceneActive=false,sceneLoading=false,sceneFailed=false;
  let sceneGeometry=null;
  function syncBunsen3D(){
    const nextActive=Boolean(bunsenScene)&&!sceneFailed;
    if(sceneActive!==nextActive)sceneGeometry=null;
    sceneActive=nextActive;
    sceneCanvas.hidden=!sceneActive;
    byId('reset-scene').hidden=!sceneActive;
    byId('reset-scene').disabled=selectionBusy||sceneLoading;
    const status=byId('bunsen-3d-status');
    status.hidden=sceneActive&&!sceneLoading;
    status.textContent=sceneFailed?'Visualizzazione 3D non disponibile su questo dispositivo':'Caricamento del modello 3D…';
    bunsenScene?.setElement(current);
    bunsenScene?.setActive(sceneActive);
  }
  function failBunsen3D(error){
    console.warn('Bunsen 3D:',error);
    sceneFailed=true;syncBunsen3D();
  }
  async function initializeBunsen3D(){
    if(!bunsenScene&&!sceneFailed){
      sceneLoading=true;syncBunsen3D();
      try{
        const module=await import(byId('bunsen-3d-module').textContent.trim());
        const textureImages=Object.fromEntries(await Promise.all(Object.entries(data.sceneTextures).map(async([name,src])=>{
          const image=new Image();image.src=src;await image.decode();return [name,image];
        })));
        bunsenScene=module.createBunsenScene({
          canvas:sceneCanvas,textureImages,elements:data.elements,// A jar on a shelf selects its element, the jar on the bench deselects it,
          // exactly as the element buttons do (selectElement toggles).
          onJar:symbol=>selectElement(symbol),
          canPickJar:()=>!selectionBusy&&!rodReturning&&!drag,
          onFailure:()=>failBunsen3D('Contesto WebGL perso'),
          onRodStart(){
            // Without an element the rod lies on the bench and cannot be picked up.
            if(!current||selectionBusy||rodReturning)return false;
            drag=true;
            return true;
          },
          async onRodEnd(){
            drag=false;
            if(!sceneActive||selectionBusy)return;
            if(quickMode&&current&&!sampleIsInsideFlame()){
              rodReturning=true;
              try{await bunsenScene.moveToFlame();}finally{rodReturning=false;}
            }
            render();
          },
        });
        await bunsenScene.precompile();
      }catch(error){failBunsen3D(error);}
      finally{sceneLoading=false;syncBunsen3D();}
    }
    bunsenScene?.resetRod(quickMode&&Boolean(current));
    syncBunsen3D();render();
  }
  let drag=false,rodReturning=false;
  const quickToggle=byId('quick-mode');
  const spectrumModeButtons=[...document.querySelectorAll('.spectrum-mode-button')];
  let spectrumGlowStyle='';
  // Always open in normal mode: browsers restore a checkbox's state on reload,
  // and a back/forward cache restore keeps the whole page as it was left.
  quickToggle.checked=false;quickMode=false;
  window.addEventListener('pageshow',event=>{
    if(event.persisted&&quickToggle.checked){quickToggle.checked=false;quickToggle.dispatchEvent(new Event('change'));}
  });
  byId('reset-scene').addEventListener('click',async()=>{
    if(!sceneActive||!bunsenScene||selectionBusy||rodReturning||drag)return;
    rodReturning=true;quickToggle.disabled=true;byId('reset-scene').disabled=true;
    try{
      await Promise.all([bunsenScene.resetView(),quickMode?Promise.resolve():bunsenScene.moveToRest()]);
    }finally{
      rodReturning=false;quickToggle.disabled=false;syncBunsen3D();render();
    }
  });
  quickToggle.addEventListener('change',async()=>{
    quickMode=quickToggle.checked;
    byId('reagent-video').loop=quickMode;
    if(!quickMode)return;
    if(!current||selectionBusy)return;
    resetReagentPanel();
    playCurrentVideo(true);
    if(sceneActive&&bunsenScene){
      rodReturning=true;
      try{await bunsenScene.moveToFlame();}finally{rodReturning=false;}
    }
    render();
  });
  for(const button of spectrumModeButtons){
    button.addEventListener('click',()=>{
      const nextMode=button.dataset.spectrumMode;
      if(nextMode===spectrumMode)return;
      const previousMode=spectrumMode;
      spectrumMode=nextMode;
      for(const option of spectrumModeButtons){
        option.setAttribute('aria-pressed',String(option.dataset.spectrumMode===spectrumMode));
      }
      startSpectrumMorph(current,current,previousMode,spectrumMode);
    });
  }
  const colorVector=color=>(color??'#000000').match(/[a-f\d]{2}/gi).map(s=>parseInt(s,16)/255);
  const rgb=()=>{
    if(flameHold)return colorVector(flameHold.color);
    if(flameColorTransition){
      const progress=Math.max(0,Math.min(1,(time-flameColorTransition.startedAt)/flameColorTransition.duration));
      const eased=progress*progress*(3-2*progress);
      const color=flameColorTransition.from.map((value,index)=>value+(flameColorTransition.to[index]-value)*eased);
      if(progress>=1)flameColorTransition=null;
      return color;
    }
    return colorVector(current?.color);
  };
  const coloredOpacity=()=>{
    if(colorFadeOutStartedAt!==null)return Math.max(0,colorFadeOutFrom*(1-(time-colorFadeOutStartedAt)/colorFadeOutDuration));
    return colorFadeStartedAt===null?0:Math.min(1,(time-colorFadeStartedAt)/COLOR_FADE_DURATION);
  };
  function updateSpectrumGlow(color,opacity,pulse){
    const channels=color.map(value=>Math.round(Math.min(1,Math.max(0,value))*255));
    const style=`${channels.join(',')};${opacity.toFixed(3)};${pulse.toFixed(3)}`;
    if(style===spectrumGlowStyle)return;
    spectrumGlowStyle=style;
    const intensity=.75+pulse*.45;
    document.documentElement.style.setProperty('--spectrum-glow-inner',`rgba(${channels.join(',')},${(.34*opacity*intensity).toFixed(3)})`);
    document.documentElement.style.setProperty('--spectrum-glow-outer',`rgba(${channels.join(',')},${(.18*opacity*intensity).toFixed(3)})`);
  }
  const PLUME_FRONT_SPEED=5;
  let lastColoredSample=null,withdrawalStartedAt=null,withdrawalSampleH=-1,revealStartedAt=null,lastSampleInside=false,exitRevealFront=-1;

  function resetColoredPlume() {
    flameColorTransition=null;
    spectrumMorph=null;
    lastColoredSample=null;
    withdrawalStartedAt=null;
    withdrawalSampleH=-1;
    revealStartedAt=null;
    lastSampleInside=false;
    exitRevealFront=-1;
    colorFadeStartedAt=null;
    colorFadeOutStartedAt=null;
    colorFadeOutFrom=0;
    colorFadeOutDuration=COLOR_FADE_DURATION;
    setSpectrumTarget(0);
  }

  function smoothUnit(a,b,value){
    const unit=Math.max(0,Math.min(1,(value-a)/(b-a)));
    return unit*unit*(3-2*unit);
  }

  function flameNoise(x,y){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
    const hash=(px,py)=>{
      const value=Math.sin(px*127.1+py*311.7)*43758.5453;
      return value-Math.floor(value);
    };
    const low=hash(ix,iy)+(hash(ix+1,iy)-hash(ix,iy))*ux;
    const high=hash(ix,iy+1)+(hash(ix+1,iy+1)-hash(ix,iy+1))*ux;
    return low+(high-low)*uy;
  }

  function flameGlowPulse(){
    const t=time*38.4;
    const slow=flameNoise(t*.04,48.1+glowNoiseSeed);
    const medium=flameNoise(t*.11,63.2+glowNoiseSeed);
    const fast=flameNoise(t*.24,71.3+glowNoiseSeed);
    return smoothUnit(.14,.86,slow*.25+medium*.45+fast*.3);
  }

  function sampleIsInsideFlame() {
    if(!current||!sceneActive||!bunsenScene)return false;
    const apparatus=sceneGeometry??(sceneGeometry=apparatusGeometry()),unit=apparatus.scale*100;
    return bunsenScene.sampleIsInsideFlame(stage.clientHeight*FLAME_HEIGHT_RATIO*1.12/unit,apparatus.radius/unit);
  }

  function releaseFlameHold(){
    flameHold=null;resetColoredPlume();
    spectrumReveal=0;spectrumTarget=0;spectrumTransition=null;drawSpectrum();
  }
  function resolveColoredPlume(geometry) {
    const sampleInside=(!selectionBusy||quickMode||Boolean(flameHold))&&sampleIsInsideFlame();
    setSpectrumTarget(sampleInside?1:0);
    if(sampleInside){
      if(!lastSampleInside){
        revealStartedAt=time;
        const opacity=coloredOpacity();
        colorFadeStartedAt=time-opacity*COLOR_FADE_DURATION;
        colorFadeOutStartedAt=null;
        colorFadeOutFrom=0;
        colorFadeOutDuration=COLOR_FADE_DURATION;
      }
      lastSampleInside=true;
      exitRevealFront=-1;
      const sampleH=(geometry.sampleY-geometry.y)/(canvas.height*FLAME_HEIGHT_RATIO);
      const coloredEnd=.95;
      let revealFront=revealStartedAt===null?-1:sampleH+(time-revealStartedAt)*PLUME_FRONT_SPEED;
      if(revealFront>=coloredEnd+.03){revealStartedAt=null;revealFront=-1;}
      let front=withdrawalStartedAt===null?-1:withdrawalSampleH+(time-withdrawalStartedAt)*PLUME_FRONT_SPEED;
      if(front>=coloredEnd+.03){withdrawalStartedAt=null;withdrawalSampleH=-1;front=-1;}
      lastColoredSample={x:geometry.sampleX,y:geometry.sampleY,radius:geometry.sampleRadius};
      return {geometry,active:true,front,revealFront};
    }
    if(lastColoredSample){
      const held={...geometry,sampleX:lastColoredSample.x,sampleY:lastColoredSample.y,sampleRadius:lastColoredSample.radius};
      const sampleH=(held.sampleY-held.y)/(canvas.height*FLAME_HEIGHT_RATIO);
      const coloredEnd=.95;
      if(withdrawalStartedAt===null){
        colorFadeOutFrom=coloredOpacity();
        colorFadeOutStartedAt=time;
        colorFadeStartedAt=null;
        colorFadeOutDuration=Math.max(.04,(coloredEnd+.03-sampleH)/PLUME_FRONT_SPEED);
        withdrawalStartedAt=time;
        withdrawalSampleH=sampleH;
        exitRevealFront=revealStartedAt===null?-1:Math.min(coloredEnd,sampleH+(time-revealStartedAt)*PLUME_FRONT_SPEED);
        revealStartedAt=null;
      }
      lastSampleInside=false;
      const front=withdrawalSampleH+(time-withdrawalStartedAt)*PLUME_FRONT_SPEED;
      if(front<coloredEnd+.03)return {geometry:held,active:true,front,revealFront:exitRevealFront};
      resetColoredPlume();
    }
    // The rod is out, the previous colour has withdrawn and its spectrum has
    // faded: from here on the flame and the spectrum show the new element.
    if(flameHold&&spectrumReveal<=.001)releaseFlameHold();
    return {geometry,active:false,front:-1,revealFront:-1};
  }

  function apparatusGeometry() {
    const rect={width:stage.clientWidth,height:stage.clientHeight};
    const openingSourceY=REFERENCE_HEIGHT*BUNSEN_OPENING_SOURCE_Y;
    const bunsenBottomSourceY=REFERENCE_HEIGHT*BUNSEN_BOTTOM_SOURCE_Y;
    const scale=rect.height*(1+FLAME_HEIGHT_RATIO)/(openingSourceY+bunsenBottomSourceY);
    const renderedWidth=REFERENCE_WIDTH*scale;
    const offsetX=(rect.width-renderedWidth)/2;
    const offsetY=(rect.height*(1+FLAME_HEIGHT_RATIO)-(openingSourceY+bunsenBottomSourceY)*scale)/2;
    app.style.setProperty('--stage-width',`${renderedWidth}px`);
    return {
      x:offsetX+REFERENCE_WIDTH*.491*scale,
      openingY:offsetY+openingSourceY*scale,
      // Salt bead on the reference 162.5 px rod photograph.
      saltRadius:Math.max(1.7,162.5*.033*scale),
      scale,
      radius:REFERENCE_WIDTH*.021*scale
    };
  }
  function flameGeometry() {
    const canvasRect=canvas.getBoundingClientRect();
    const apparatus=sceneGeometry??(sceneGeometry=apparatusGeometry());
    const unit=apparatus.scale*100,pixelX=canvas.width/canvasRect.width,pixelY=canvas.height/canvasRect.height;
    bunsenScene.configureRod(apparatus.radius*.65/unit,3.26+stage.clientHeight*FLAME_HEIGHT_RATIO*.18/unit);
    const sample=bunsenScene.getRodPose().position;
    return {
      x:apparatus.x*pixelX,y:(canvasRect.height-apparatus.openingY)*pixelY,
      radius:apparatus.radius*pixelX,sampleX:(apparatus.x+sample.x*unit)*pixelX,
      sampleY:(canvasRect.height-apparatus.openingY+(sample.y-3.26)*unit/1.12)*pixelY,
      sampleRadius:apparatus.saltRadius*pixelX
    };
  }
  let lastRenderTime=-Infinity;
  function render() {
    if(!canvas.width||!canvas.height)return;
    // Cap every render entry point, including drag and transition callbacks.
    const now=performance.now();
    // A few ms of tolerance: timer jitter must not drop every other frame.
    if(now-lastRenderTime<1000/30-4)return;
    lastRenderTime=now;
    const color=rgb();
    const opacity=coloredOpacity();
    updateSpectrumGlow(color,opacity,flameGlowPulse());
    // No 3D frame before precompile(): it would compile the shaders blocking.
    if(!sceneActive||!bunsenScene||sceneLoading)return;
    const plume=resolveColoredPlume(flameGeometry());
    bunsenScene.render({geometry:sceneGeometry??(sceneGeometry=apparatusGeometry()),color,intensity:opacity,time,
      plume:{active:plume.active,inside:lastSampleInside,front:plume.front,revealFront:plume.revealFront},
      visible:true});
  }
  function resize() {
    sceneGeometry=apparatusGeometry();
    const rect=canvas.getBoundingClientRect();
    const pixelRatio=Math.min(1.5,window.devicePixelRatio||1);
    canvas.width=Math.max(1,Math.round(rect.width*pixelRatio));canvas.height=Math.max(1,Math.round(rect.height*pixelRatio));
    render();drawSpectrum();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  new ResizeObserver(drawSpectrum).observe(byId('spectrum').parentElement);
  const syncSpectrumColumns=()=>{
    const reagentWidth=byId('reagent-panel').getBoundingClientRect().width;
    if(reagentWidth>0)app.style.setProperty('--reagent-width',`${reagentWidth}px`);
    const stageRect=stage.getBoundingClientRect();
    const elementsRect=byId('elements').getBoundingClientRect();
    const plotRect=document.querySelector('.spectrum-plot').getBoundingClientRect();
    const [theoreticalButton,experimentalButton]=document.querySelectorAll('.spectrum-mode-button');
    const buttonsMid=(theoreticalButton.getBoundingClientRect().right+experimentalButton.getBoundingClientRect().left)*.5;
    if(elementsRect.width>0&&buttonsMid>elementsRect.left)app.style.setProperty('--elements-width',`${buttonsMid-elementsRect.left}px`);
    if(stageRect.width>0&&elementsRect.width>0&&plotRect.width>0){
      const elementsBesideStage=Math.abs(elementsRect.top-stageRect.top)<2;
      const gapCenter=elementsBesideStage?(elementsRect.right+stageRect.left)*.5-plotRect.left:0;
      app.style.setProperty('--stage-shadow-start',`${Math.max(0,gapCenter)}px`);
    }
  };
  const spectrumColumnsObserver=new ResizeObserver(syncSpectrumColumns);
  spectrumColumnsObserver.observe(byId('reagent-panel'));
  spectrumColumnsObserver.observe(stage);
  spectrumColumnsObserver.observe(document.querySelector('.spectrum-mode'));
  syncSpectrumColumns();
  let previous=0;
  function animate(now){
    // Tolerance keeps a steady 30 FPS cadence on 60 Hz screens instead of
    // occasionally waiting a third refresh when timestamps jitter.
    if(now-previous>=1000/30-4){
      const dt=Math.min(.1,(now-previous)/1000);previous=now;
      if(!document.hidden){
        time+=dt;
        render();
        if(spectrumTransition){
          const before=spectrumReveal;
          const progress=Math.min(1,(time-spectrumTransition.startedAt)/spectrumTransition.duration);
          const eased=progress*progress*(3-2*progress);
          spectrumReveal=spectrumTransition.from+(spectrumTransition.to-spectrumTransition.from)*eased;
          if(progress>=1)spectrumTransition=null;
          if(Math.abs(spectrumReveal-before)>.0001)drawSpectrum();
        }
        if(spectrumMorph){
          const progress=(time-spectrumMorph.startedAt)/spectrumMorph.duration;
          drawSpectrum();
          if(progress>=1){spectrumMorph=null;drawSpectrum();}
        }
      }
    }
    requestAnimationFrame(animate);
  }
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  // Asset steps are many and quick, while the 3D setup (WebGL init, shader
  // compilation, hidden first frame) is one long step that blocks the main
  // thread and keeps the GPU busy. Bar and percentage therefore never need a
  // repaint: the bar is a scaled layer and each digit a pre-drawn strip moved
  // by transform. During the 3D step both run as compositor animations built
  // from the same curve, so the number matches the fill even while blocked.
  const ASSET_SHARE=.62,SCENE_CEILING=.99,SCENE_TIME_CONSTANT=2.5,SCENE_CREEP_SECONDS=24,SCENE_STEP_SECONDS=.25;
  const loaderBar=byId('viewer-loader-bar');
  const DIGIT_STRIPS=['\u00a01','\u00a01234567890','0123456789'];
  const loaderDigits=DIGIT_STRIPS.map(digits=>{
    const strip=document.createElement('span');strip.className='viewer-loader-digit-strip';
    for(const digit of digits){const line=document.createElement('span');line.textContent=digit;strip.append(line);}
    const cell=document.createElement('span');cell.className='viewer-loader-digit';cell.append(strip);
    return strip;
  });
  byId('viewer-loader-value').replaceChildren(...loaderDigits.map(strip=>strip.parentElement),'%');
  let loaderShown=-1,loaderTicking=true,sceneCreep=[];
  let loaderTarget=0,loaderValue=0,loaderTickTime=performance.now();
  const loaderPercentage=fraction=>Math.round(Math.max(0,Math.min(1,fraction))*100);
  const digitIndexes=percentage=>percentage>=100?[1,10,0]:[0,Math.floor(percentage/10),percentage%10];
  const digitTransform=index=>`translateY(${-index}em)`;
  function loaderBarFraction(){
    const transform=getComputedStyle(loaderBar).transform;
    const match=/^matrix\(([^,]+)/.exec(transform);
    return match?Number(match[1]):0;
  }
  // Bar and digits are always written together, so they land in one frame.
  function showLoaderFraction(fraction,force=false){
    loaderBar.style.transform=`scaleX(${fraction})`;
    const percentage=loaderPercentage(fraction);
    if(percentage===loaderShown&&!force)return;
    loaderShown=percentage;
    digitIndexes(percentage).forEach((index,place)=>{loaderDigits[place].style.transform=digitTransform(index);});
    const progress=byId('viewer-loader-progress');
    progress.setAttribute('aria-valuenow',String(percentage));
    progress.setAttribute('aria-valuetext',`${percentage}% completato`);
  }
  // Outside the 3D step the bar eases towards its target from a timer (not
  // requestAnimationFrame, which is throttled while the GPU compiles).
  (function tickLoader(){
    const now=performance.now(),elapsed=Math.min(100,now-loaderTickTime);loaderTickTime=now;
    if(!sceneCreep.length&&loaderValue<loaderTarget){
      loaderValue=Math.min(loaderTarget,loaderValue+Math.max((loaderTarget-loaderValue)*(1-Math.exp(-elapsed/110)),elapsed*.00012));
      showLoaderFraction(loaderValue);
    }
    if(loaderTicking)setTimeout(tickLoader,16);
  })();
  function updateLoadingProgress(completed,total){
    loaderTarget=Math.max(loaderTarget,(total?completed/total:1)*ASSET_SHARE);
  }
  function startSceneLoadingProgress(){
    // Approaches the ceiling exponentially, so it moves fast when the shaders
    // are cached (~2 s) and keeps creeping on a cold compile (~13 s).
    const from=loaderValue;
    showLoaderFraction(from,true);
    const duration=SCENE_CREEP_SECONDS*1000,steps=Math.round(SCENE_CREEP_SECONDS/SCENE_STEP_SECONDS);
    const fractionAt=step=>from+(SCENE_CEILING-from)*(1-Math.exp(-step*SCENE_STEP_SECONDS/SCENE_TIME_CONSTANT));
    const barFrames=[],digitFrames=[[],[],[]];
    let shown=loaderPercentage(from),indexes=digitIndexes(shown);
    indexes.forEach((index,place)=>digitFrames[place].push({offset:0,transform:digitTransform(index),easing:'step-end'}));
    for(let step=0;step<=steps;step++){
      const a=fractionAt(step);
      barFrames.push({offset:step/steps,transform:`scaleX(${a})`});
      if(step===steps)break;
      // The bar is linear between keyframes: place each digit change exactly
      // where that line crosses the rounding threshold of the next percent.
      const b=fractionAt(step+1);
      while(shown<loaderPercentage(b)){
        const next=shown+1,crossing=(next-.5)/100;
        const offset=(step+Math.max(0,Math.min(1,(crossing-a)/(b-a))))/steps;
        const nextIndexes=digitIndexes(next);
        nextIndexes.forEach((index,place)=>{
          if(index!==indexes[place])digitFrames[place].push({offset,transform:digitTransform(index),easing:'step-end'});
        });
        shown=next;indexes=nextIndexes;
      }
    }
    indexes.forEach((index,place)=>digitFrames[place].push({offset:1,transform:digitTransform(index)}));
    // Created in the same task, so they share one start time.
    sceneCreep=[loaderBar.animate(barFrames,{duration,fill:'forwards'}),
      ...loaderDigits.map((strip,place)=>strip.animate(digitFrames[place],{duration,fill:'forwards'}))];
  }
  async function finishLoadingProgress(){
    // Continue from where the 3D animation is, then ease to 100% from the timer.
    if(sceneCreep.length){
      loaderValue=loaderBarFraction();
      showLoaderFraction(loaderValue,true);
      for(const animation of sceneCreep)animation.cancel();
      sceneCreep=[];
    }
    loaderTarget=1;
    await new Promise(resolve=>{
      (function wait(){loaderValue>=.999?resolve():setTimeout(wait,16);})();
    });
    loaderTicking=false;
    showLoaderFraction(1);
  }
  async function preloadImageSource(source){
    const image=new Image();
    image.src=source;
    try{
      if(image.decode)await image.decode();
      else if(!image.complete)await new Promise(resolve=>{
        image.addEventListener('load',resolve,{once:true});
        image.addEventListener('error',()=>resolve(),{once:true});
      });
    }catch(error){
      throw new Error('Impossibile decodificare una risorsa grafica',{cause:error});
    }
    if(!image.complete||!image.naturalWidth)throw new Error('Risorsa grafica non caricata');
  }
  async function preloadViewerFonts(){
    if(!document.fonts)return;
    const [syne,fira]=await Promise.all([
      document.fonts.load('800 1.833333rem Syne','Caricamento'),
      document.fonts.load('400 1.3125rem "Fira Code"','100%'),
      document.fonts.ready
    ]);
    if(!syne.length||!fira.length)throw new Error('Font del viewer non caricati');
  }
  async function prepareViewerMotion(){
    resize();
    render();
    const animatedElements=[document.body,...document.querySelectorAll('.element')];
    for(const element of animatedElements){
      const styles=getComputedStyle(element);
      void styles.animationName;
      void styles.animationDuration;
      void styles.transform;
    }
    void app.offsetWidth;
    await nextFrame();
    const animations=typeof document.getAnimations==='function'
      ?document.getAnimations()
      :typeof document.documentElement.getAnimations==='function'
        ?document.documentElement.getAnimations({subtree:true})
        :[];
    await Promise.all(animations.map(animation=>animation.ready.catch(()=>{})));
    await nextFrame();
  }
  async function revealViewer(){
    const imageSources=[...new Set([
      ...Object.values(data.sceneTextures),
      ...data.elements.flatMap(element=>[element.videoThumbnail])
    ].filter(Boolean))];
    const spectrumJobs=data.elements.flatMap(element=>[
      [element,'theoretical'],
      ...(element.experimentalSpectrum?.length?[[element,'experimental']]:[])
    ]);
    const total=imageSources.length+spectrumJobs.length+1;
    let completed=0;
    const advance=()=>updateLoadingProgress(++completed,total);
    updateLoadingProgress(0,total);
    const imageLoads=imageSources.map(source=>preloadImageSource(source).then(advance));
    const fontLoad=preloadViewerFonts().then(advance);
    const spectrumWidth=Math.max(1,Math.round(byId('spectrum').parentElement.getBoundingClientRect().width-40));
    for(const [element,mode] of spectrumJobs){
      spectrumSamples(element,mode,spectrumWidth,bounds);
      advance();
      await nextFrame();
    }
    await Promise.all([...imageLoads,fontLoad]);
    startSceneLoadingProgress();
    // Let the compositor pick up the transition before the main thread blocks.
    await nextFrame();await nextFrame();
    await initializeBunsen3D();
    if(bunsenScene&&!sceneFailed){
      flameGeometry();
      await bunsenScene.prepare(current||elements.get('Na')||fallbackElement,{
        geometry:sceneGeometry??(sceneGeometry=apparatusGeometry()),color:rgb(),intensity:0,time,
        visible:true,
        plume:{active:false,inside:false,front:-1,revealFront:-1}
      });
    }
    await prepareViewerMotion();
    await finishLoadingProgress();
    app.removeAttribute('inert');
    app.setAttribute('aria-busy','false');
    app.classList.add('is-ready');
    await nextFrame();
    loader.classList.add('is-complete');
    loader.setAttribute('aria-hidden','true');
  }
  if(current)applyElement(current);else initializeNeutralState();
  resize();requestAnimationFrame(animate);revealViewer();
})();
