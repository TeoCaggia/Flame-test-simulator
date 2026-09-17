(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('flame-data').textContent);
  const byId = id => document.getElementById(id);
  const elements = new Map(data.elements.map(element => [element.symbol, element]));
  byId('elements').style.setProperty('--element-count', data.elements.length);
  const query = new URLSearchParams(location.search);
  const requestedElement=elements.get(query.get('element'));
  const fallbackElement=elements.get(data.defaultElement)||data.elements[0];
  let current=requestedElement||null;
  const bounds = [350, 800];
  let time = 0;
  let rodHasMoved = false;
  let rodOutsideSince = null;
  let selectionBusy=false;
  const COLOR_FADE_DURATION=.5;
  let colorFadeStartedAt=null,colorFadeOutStartedAt=null,colorFadeOutFrom=0,colorFadeOutDuration=COLOR_FADE_DURATION;
  let spectrumReveal=0;
  let spectrumTarget=0;
  let spectrumTransition=null;
  const SPECTRUM_TRANSITION_DURATION=4/9;
  const svgNS = 'http://www.w3.org/2000/svg';
  function setSpectrumTarget(target){
    if(target===spectrumTarget)return;
    spectrumTarget=target;
    spectrumTransition={from:spectrumReveal,to:target,startedAt:time};
  }
  function svgNode(tag, attrs = {}, text) {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function spectralColor(nm) {
    const stops = [[380,[137,74,223]],[440,[83,77,255]],[490,[42,197,246]],
      [515,[53,217,135]],[555,[174,231,70]],[590,[255,206,54]],
      [630,[255,90,49]],[700,[218,45,56]],[780,[121,38,49]],[800,[92,28,38]]];
    let i = 1;
    while (i < stops.length - 1 && nm > stops[i][0]) i++;
    const [a, ca] = stops[i-1], [b, cb] = stops[i];
    const t = Math.max(0, Math.min(1, (nm-a)/(b-a)));
    return `rgb(${ca.map((v,j) => Math.round(v + (cb[j]-v)*t)).join(',')})`;
  }

  function drawSpectrum() {
    const svg = byId('spectrum');
    svg.replaceChildren();
    const width = Math.max(280, svg.getBoundingClientRect().width);
    svg.setAttribute('viewBox', `0 0 ${width} 148`);
    const left = 20, right = width - 20, top = 38, baseline = 116;
    const x = nm => left + (nm - bounds[0]) / (bounds[1] - bounds[0]) * (right-left);
    svg.append(svgNode('rect', {x:left,y:top,width:right-left,height:baseline-top,fill:'#03040b'}));
    const defs=svgNode('defs');
    const spectrumGradient=svgNode('linearGradient',{id:'visible-spectrum',gradientUnits:'userSpaceOnUse',x1:left,x2:right,y1:0,y2:0});
    for(const nm of [350,380,410,440,470,490,515,555,590,630,680,730,780,800]){
      spectrumGradient.append(svgNode('stop',{offset:`${(nm-bounds[0])/(bounds[1]-bounds[0])*100}%`,'stop-color':spectralColor(nm)}));
    }
    defs.append(spectrumGradient);svg.append(defs);
    for (let nm=bounds[0]; nm<=bounds[1]; nm+=50) {
      svg.append(svgNode('line', {x1:x(nm),x2:x(nm),y1:top,y2:baseline,stroke:'#141824','stroke-width':1}));
      svg.append(svgNode('text', {x:x(nm),y:136,fill:'#8fb8df','font-size':8,'font-family':'system-ui','text-anchor':nm===bounds[0]?'start':nm===bounds[1]?'end':'middle'}, String(nm)));
    }
    const background = nm => {
      const visible=(nm-bounds[0])/(bounds[1]-bounds[0]);
      return 1.8+4.5*Math.pow(visible,1.55)+1.1*Math.exp(-.5*Math.pow((nm-431)/48,2));
    };
    if(!current){
      const baselinePoints=[];
      const samples=Math.ceil((right-left)*4);
      for(let step=0;step<=samples;step++){
        const px=left+(right-left)*step/samples;
        const nm=bounds[0]+(px-left)/(right-left)*(bounds[1]-bounds[0]);
        baselinePoints.push(`${px},${baseline-background(nm)}`);
      }
      svg.append(svgNode('path',{d:`M ${baselinePoints.join(' L ')}`,fill:'none',stroke:'url(#visible-spectrum)','stroke-width':1.65,'stroke-linejoin':'round','stroke-linecap':'round'}));
      svg.onpointermove=null;
      svg.onpointerleave=null;
      svg.setAttribute('aria-label','Spettro vuoto; nessun elemento selezionato.');
      return;
    }
    const peaks=current.lines_nm.map((nm,index)=>({nm,x:x(nm),strength:current.line_strengths?.[index]??1,amplitude:13+(current.line_strengths?.[index]??1)*49}));
    const clusters=[];
    for(const peak of peaks){
      const cluster=clusters.at(-1);
      if(!cluster||peak.x-cluster.at(-1).x>14)clusters.push([peak]);else cluster.push(peak);
    }
    const profiles=[];
    for(const cluster of clusters){
      const weight=cluster.reduce((sum,peak)=>sum+peak.strength,0);
      const trueCenter=cluster.reduce((sum,peak)=>sum+peak.x*peak.strength,0)/weight;
      const displayX=[cluster[0].x];
      for(let i=1;i<cluster.length;i++)displayX.push(displayX[i-1]+Math.max(3.2,cluster[i].x-cluster[i-1].x));
      const displayCenter=displayX.reduce((sum,position,index)=>sum+position*cluster[index].strength,0)/weight;
      const shiftedX=displayX.map(position=>position+trueCenter-displayCenter);
      const separations=shiftedX.slice(1).map((position,index)=>position-shiftedX[index]);
      const sigma=separations.length?Math.min(1.4,Math.min(...separations)*.25):1.4;
      profiles.push({cluster,weight,shiftedX,sigma});
    }
    for(let index=0;index<(current.background_lines_nm?.length??0);index++){
      const nm=current.background_lines_nm[index],strength=current.background_line_strengths[index];
      profiles.push({cluster:[{nm,x:x(nm),strength,amplitude:strength*12}],weight:strength,shiftedX:[x(nm)],sigma:.62});
    }
    for(const band of current.molecular_bands??[]){
      const center=x(band.center_nm);
      const sigma=Math.max(.8,x(band.center_nm+band.sigma_nm)-center);
      profiles.push({
        cluster:[{nm:band.center_nm,x:center,strength:band.strength,amplitude:band.strength*54}],
        weight:band.strength,
        shiftedX:[center],
        sigma
      });
    }
    const samples=Math.ceil((right-left)*4);
    const rawSignalAt=px=>profiles.reduce((total,profile)=>total+profile.cluster.reduce((sum,peak,index)=>sum+peak.amplitude*Math.exp(-.5*Math.pow((px-profile.shiftedX[index])/profile.sigma,2)),0),0);
    let signalMaximum=0;
    for(let step=0;step<=samples;step++){
      const px=left+(right-left)*step/samples;
      signalMaximum=Math.max(signalMaximum,rawSignalAt(px));
    }
    const signalScale=Math.min(1,72/Math.max(1,signalMaximum));
    const signalAt=px=>rawSignalAt(px)*signalScale*spectrumReveal;
    const tracePoints=[];
    for(let step=0;step<=samples;step++){
      const px=left+(right-left)*step/samples;
      const nm=bounds[0]+(px-left)/(right-left)*(bounds[1]-bounds[0]);
      tracePoints.push(`${px},${baseline-background(nm)-signalAt(px)}`);
    }
    const fillPath=`M ${left},${baseline} L ${tracePoints.join(' ')} L ${right},${baseline} Z`;
    const tracePath=`M ${tracePoints.join(' L ')}`;
    svg.append(svgNode('path',{d:fillPath,fill:'url(#visible-spectrum)','fill-opacity':'.1',stroke:'none'}));
    const trace=svgNode('path',{d:tracePath,fill:'none',stroke:'url(#visible-spectrum)','stroke-width':1.65,'stroke-linejoin':'round','stroke-linecap':'round'});
    const bandCount=current.molecular_bands?.length??0;
    const summary=bandCount
      ? `${bandCount} bande molecolari, ${current.lines_nm.length} righe atomiche principali e ${current.background_lines_nm?.length??0} righe atomiche secondarie NIST`
      : `${current.lines_nm.length} righe diagnostiche e ${current.background_lines_nm?.length??0} righe secondarie NIST`;
    svg.append(trace);
    const cursor=svgNode('g',{'visibility':'hidden','pointer-events':'none','aria-hidden':'true'});
    const cursorLine=svgNode('line',{y1:top,y2:baseline,stroke:'#fff','stroke-opacity':'.5','stroke-width':1});
    const cursorLabel=svgNode('text',{y:22,fill:'#fff','font-size':12,'font-family':'system-ui','text-anchor':'middle'});
    cursor.append(cursorLine,cursorLabel);
    svg.append(cursor);
    svg.onpointermove=spectrumReveal>.01?event=>{
      const matrix=svg.getScreenCTM();
      if(!matrix)return;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
      if(point.x<left||point.x>right||point.y<0||point.y>baseline){
        cursor.setAttribute('visibility','hidden');
        return;
      }
      const nm=bounds[0]+(point.x-left)/(right-left)*(bounds[1]-bounds[0]);
      cursorLine.setAttribute('x1',point.x);
      cursorLine.setAttribute('x2',point.x);
      cursorLabel.setAttribute('x',Math.max(left+30,Math.min(right-30,point.x)));
      cursorLabel.textContent=`${nm.toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})} nm`;
      cursor.setAttribute('visibility','visible');
    }:null;
    svg.onpointerleave=()=>cursor.setAttribute('visibility','hidden');
    svg.setAttribute('aria-label', `Spettro qualitativo di ${current.name}: ${summary}.`);
  }

  for (const element of data.elements) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'element';
    button.dataset.symbol = element.symbol;
    button.style.setProperty('--element-color', element.color);
    button.setAttribute('aria-label', `${element.name}, ${element.symbol}, numero atomico ${element.number}`);
    const tile = document.createElement('span'); tile.className='tile';
    const symbol = document.createElement('strong'); symbol.textContent=element.symbol;
    tile.append(symbol);
    const name=document.createElement('span'); name.className='element-name'; name.textContent=element.name;
    button.append(tile,name);
    button.addEventListener('click', () => selectElement(element.symbol));
    byId('elements').append(button);
  }

  function setFormulaText(target,formula){
    target.replaceChildren();
    for(const part of formula.match(/\d+|\D+/g)??[]){
      const node=/^\d+$/.test(part)?document.createElement('sub'):document.createTextNode(part);
      if(node.nodeType===Node.ELEMENT_NODE)node.textContent=part;
      target.append(node);
    }
  }

  function resetReagentPanel(){
    byId('reagent-panel').classList.remove('has-formula');
    byId('reagent-formula').replaceChildren();
    const hotspot=byId('jar-hotspot');
    hotspot.classList.remove('is-revealed');
    hotspot.setAttribute('aria-label',`Mostra la formula di ${current.reagentName.toLowerCase()}`);
  }

  function showReagentFormula(){
    if(!current)return;
    setFormulaText(byId('reagent-formula'),current.reagentFormula);
    byId('reagent-panel').classList.add('has-formula');
    const hotspot=byId('jar-hotspot');
    hotspot.classList.add('is-revealed');
    hotspot.setAttribute('aria-label',`${current.reagentName}: ${current.reagentFormula}`);
  }

  function applyElement(element) {
    current=element;
    colorFadeStartedAt=null;
    spectrumReveal=0;
    spectrumTarget=0;
    spectrumTransition=null;
    rodOffsetX=0;rodOffsetY=0;
    rodHasMoved=false;
    rodOutsideSince=null;
    setRodOffset(0,0);
    sampleFixture.classList.remove('rod-moved');
    resetColoredPlume();
    document.documentElement.style.setProperty('--salt-color', current.saltColor);
    byId('lab-background').src = current.backgroundImage;
    byId('flame').style.opacity='1';
    byId('jar-hotspot').hidden=false;
    byId('jar-hotspot').disabled=false;
    resetReagentPanel();
    byId('flame').setAttribute('aria-label', `Fiamma ${current.colorName.toLowerCase()} del ${current.name.toLowerCase()}; rappresentazione qualitativa`);
    for (const button of byId('elements').children) button.setAttribute('aria-pressed', String(button.dataset.symbol===current.symbol));
    drawSpectrum();
    render();
  }

  function returnRodHome(){
    const startX=rodOffsetX,startY=rodOffsetY;
    const distance=Math.hypot(startX,startY);
    if(distance<.5){setRodOffset(0,0);return Promise.resolve();}
    const duration=Math.max(240,Math.min(640,distance/1.1));
    return new Promise(resolve=>{
      const started=performance.now();
      const step=now=>{
        const progress=Math.min(1,(now-started)/duration);
        setRodOffset(startX*(1-progress),startY*(1-progress));
        render();
        if(progress<1)requestAnimationFrame(step);else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  async function selectElement(symbol) {
    if(!elements.has(symbol))throw new RangeError(`Unknown element: ${symbol}`);
    if(selectionBusy)return;
    selectionBusy=true;
    try{
      const deselect=current?.symbol===symbol;
      await new Promise(resolve=>setTimeout(resolve,150));
      await returnRodHome();
      rodHasMoved=false;
      rodOutsideSince=null;
      sampleFixture.classList.remove('rod-moved');
      resetColoredPlume();
      const background=byId('lab-background');
      const stageContent=byId('stage-content');
      await new Promise(resolve=>setTimeout(resolve,150));
      stageContent.classList.add('is-changing');
      await new Promise(resolve=>setTimeout(resolve,140));
      if(deselect)initializeNeutralState();else applyElement(elements.get(symbol));
      await waitForImage(background);
      await new Promise(resolve=>requestAnimationFrame(()=>{
        stageContent.classList.remove('is-changing');
        resolve();
      }));
      await new Promise(resolve=>setTimeout(resolve,140));
    }finally{
      selectionBusy=false;
    }
  }

  function initializeNeutralState(){
    current=null;
    spectrumReveal=0;
    spectrumTarget=0;
    spectrumTransition=null;
    document.documentElement.style.setProperty('--salt-color',fallbackElement.saltColor);
    byId('lab-background').src=data.neutralBackgroundImage;
    byId('flame').style.opacity='1';
    byId('flame').setAttribute('aria-label','Fiamma a butano; nessun elemento selezionato');
    const hotspot=byId('jar-hotspot');
    hotspot.hidden=true;
    hotspot.disabled=true;
    hotspot.setAttribute('aria-label','Seleziona un elemento per mostrare la formula del reagente');
    hotspot.classList.remove('is-revealed');
    byId('reagent-panel').classList.remove('has-formula');
    byId('reagent-formula').replaceChildren();
    for(const button of byId('elements').children)button.setAttribute('aria-pressed','false');
    resetColoredPlume();
    drawSpectrum();
    render();
  }

  const fragment = `precision mediump float;
    uniform vec2 resolution;
    uniform vec2 flameOrigin;
    uniform float outletRadius;
    uniform vec2 samplePosition;
    uniform float sampleRadius;
    uniform float sampleActive;
    uniform float withdrawalFront;
    uniform float revealFront;
    uniform float coloredOpacity;
    uniform float time;
    uniform vec3 tint;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.09);}
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution;
      float base=flameOrigin.y/resolution.y;
      float t=time*4.8;
      float flow=t*1.5;
      float swayTime=t*2.65;
      float shapeSignal=noise(vec2(t*.045,48.1))*.65+noise(vec2(t*.09,63.2))*.35;
      float shapePulse=smoothstep(.6,.84,shapeSignal);
      float heightScale=1.0+shapePulse*.06;
      float widthScale=1.0+shapePulse*.07;
      float h=(uv.y-base)/(.408*heightScale);
      float aspect=resolution.x/resolution.y;
      float x=(uv.x-flameOrigin.x/resolution.x)*aspect/.75;
      float rise=fbm(vec2(h*5.8-flow*2.7,x*8.0+t*.13))-.5;
      float fine=fbm(vec2(h*12.0-flow*4.6,x*19.0-t*.19))-.5;
      float activityThreshold=mix(.43,.63,noise(vec2(t*.075,91.7)));
      float movementActivity=smoothstep(activityThreshold,activityThreshold+.16,noise(vec2(t*.27,71.3)));
      float idleDrift=(noise(vec2(t*.07,15.2))-.5)*.006*h;
      float chaoticBroad=(noise(vec2(swayTime*.48+h*1.4,3.7))-.5)*.026;
      float chaoticFast=(noise(vec2(swayTime*1.16-h*2.3,8.4))-.5)*.013;
      float chaoticCross=(noise(vec2(swayTime*.77+h*3.9,19.6))-.5)*.006;
      float activeSway=(chaoticBroad+chaoticFast+chaoticCross+rise*.0045+sin(h*8.3-swayTime*.61)*.002)*h;
      float sway=(idleDrift+activeSway*movementActivity)*.82;
      float mouth=outletRadius/resolution.y;
      float baseBreathe=(.0015*rise+.0002*fine)*h;
      float baseWidth=(mouth*(1.08-.58*clamp(h,0.0,1.0))+.04576*pow(max(0.0,1.0-h),.72)*smoothstep(-.02,.12,h)+baseBreathe)*widthScale;
      float baseCapPosition=max(0.0,(h-.88)/.17);
      float baseCap=sqrt(max(0.0,1.0-baseCapPosition*baseCapPosition));
      float baseShape=max(.001,baseWidth*baseCap);
      float baseD=abs(x-sway)/max(.002,baseShape);
      float flameVertical=smoothstep(-.012,.018,h)*(1.0-smoothstep(.75,.95,h));
      float blueBody=(1.0-smoothstep(.64,1.07,baseD))*flameVertical;
      float blueVeil=(1.0-smoothstep(.9,1.42,baseD))*flameVertical;
      float upperFadeProgress=smoothstep(.75,.95,h);
      float blueBodySideFade=mix(1.0,1.0-smoothstep(.58,1.22,baseD),upperFadeProgress*.24);
      float blueVeilSideFade=mix(1.0,1.0-smoothstep(.68,1.4,baseD),upperFadeProgress*.34);
      blueBody*=blueBodySideFade;
      blueVeil*=blueVeilSideFade;

      float sampleH=(samplePosition.y-flameOrigin.y)/(resolution.y*.408*heightScale);
      float sampleX=(samplePosition.x-flameOrigin.x)/resolution.y/.75;
      float coloredH=(h-sampleH)/max(.1,1.02-sampleH);
      float ch=clamp(coloredH,0.0,1.0);
      float sampleRise=fbm(vec2(sampleH*5.8-flow*2.7,sampleX*8.0+t*.13))-.5;
      float sampleChaoticBroad=(noise(vec2(swayTime*.48+sampleH*1.4,3.7))-.5)*.026;
      float sampleChaoticFast=(noise(vec2(swayTime*1.16-sampleH*2.3,8.4))-.5)*.013;
      float sampleChaoticCross=(noise(vec2(swayTime*.77+sampleH*3.9,19.6))-.5)*.006;
      float sampleActiveSway=(sampleChaoticBroad+sampleChaoticFast+sampleChaoticCross+sampleRise*.0045+sin(sampleH*8.3-swayTime*.61)*.002)*sampleH;
      float sampleSway=((noise(vec2(t*.07,15.2))-.5)*.006*sampleH+sampleActiveSway*movementActivity)*.82;
      float sampleWidth=(mouth*(1.08-.58*clamp(sampleH,0.0,1.0))+.04576*pow(max(0.0,1.0-sampleH),.72)*smoothstep(-.02,.12,sampleH))*widthScale;
      float sampleCapPosition=max(0.0,(sampleH-.88)/.17);
      float sampleShape=max(.001,sampleWidth*sqrt(max(0.0,1.0-sampleCapPosition*sampleCapPosition)));
      float sampleLateral=clamp((sampleX-sampleSway)/sampleShape,-1.0,1.0);
      float shoulderH=max(sampleH,min(.68,max(.52,sampleH+.28)));
      float shoulderWidth=(mouth*(1.08-.58*clamp(shoulderH,0.0,1.0))+.04576*pow(max(0.0,1.0-shoulderH),.72)*smoothstep(-.02,.12,shoulderH))*widthScale;
      float coloredEnd=.95;
      float plumeProgress=clamp((h-sampleH)/max(.1,coloredEnd-sampleH),0.0,1.0);
      float colorDrift=(rise*.0025+fine*.0003+sin(plumeProgress*6.0+t*.77)*.0015)*smoothstep(0.0,.28,plumeProgress);
      float overlayGrowth=smoothstep(-.12,.3,plumeProgress);
      float overlayNarrowing=smoothstep(.52,1.15,plumeProgress);
      float saltWidth=sampleRadius/resolution.y/.75;
      float expandedWidth=mix(saltWidth,shoulderWidth*.64,overlayGrowth);
      float topSupport=shoulderWidth*.1*smoothstep(.72,1.02,h);
      float coloredWidthShape=max(baseShape,topSupport);
      float taperedWidth=max(saltWidth*.55,coloredWidthShape*.64);
      float upperSlimming=mix(1.0,.84,smoothstep(.78,1.0,plumeProgress));
      float overlayWidth=mix(expandedWidth,taperedWidth,overlayNarrowing)*upperSlimming;
      float curve=smoothstep(0.0,1.0,plumeProgress);
      float curveTarget=sway+sampleLateral*shoulderWidth*.3;
      float curvedInward=-sampleLateral*shoulderWidth*.16*sin(curve*3.14159);
      float upperMotion=(sin(t*.93+h*5.1)*.0035+fine*.0022)*smoothstep(.36,.88,plumeProgress);
      float overlayCenter=mix(sampleX,curveTarget,curve)+curvedInward+colorDrift+upperMotion;
      float clearingFront=withdrawalFront+rise*.022+fine*.006;
      float appearingFront=revealFront+rise*.018+fine*.005;
      float withdrawing=step(0.0,withdrawalFront);
      float appearing=step(0.0,revealFront);
      float withdrawalWidth=mix(1.0,max(.08,smoothstep(clearingFront-.018,clearingFront+.2,h)),withdrawing);
      float revealWidth=mix(1.0,max(.08,smoothstep(h-.018,h+.2,appearingFront)),appearing);
      float solitaryWidth=mix(mix(1.0,withdrawalWidth,withdrawing),revealWidth,appearing);
      float transitionWidth=mix(solitaryWidth,max(withdrawalWidth,revealWidth),withdrawing*appearing);
      float overlayD=abs(x-overlayCenter)/max(.001,overlayWidth*transitionWidth);
      float startLateral=clamp(abs(x-overlayCenter)/max(.001,saltWidth),0.0,1.0);
      float curvedStart=.018*(1.0-sqrt(max(0.0,1.0-startLateral*startLateral)));
      float boundarySupport=shoulderWidth*.42*smoothstep(.68,1.02,h);
      float coloredBoundaryShape=max(baseShape,boundarySupport);
      float coloredBaseD=abs(x-sway)/max(.002,coloredBoundaryShape);
      float plumeClip=1.0-smoothstep(.88,1.22,coloredBaseD);
      float coloredTop=1.0-smoothstep(.75,.95,h);
      float withdrawalMask=smoothstep(clearingFront-.035,clearingFront+.055,h);
      float revealMask=1.0-smoothstep(appearingFront-.055,appearingFront+.035,h);
      revealMask=mix(1.0,revealMask,appearing);
      float solitaryMask=mix(mix(1.0,withdrawalMask,withdrawing),revealMask,appearing);
      float transitionMask=mix(solitaryMask,max(withdrawalMask,revealMask),withdrawing*appearing);
      float overlayVertical=smoothstep(curvedStart-.026,curvedStart+.058,coloredH)*coloredTop*plumeClip*transitionMask*sampleActive;
      float body=(1.0-smoothstep(.62,1.05,overlayD))*overlayVertical;
      float veil=(1.0-smoothstep(.9,1.34,overlayD))*overlayVertical;
      float rim=exp(-pow((overlayD-.77)*3.8,2.0))*overlayVertical;
      float center=exp(-overlayD*overlayD*2.0)*overlayVertical;
      float coloredSideShape=1.0-smoothstep(.52,1.28,overlayD);
      float coloredUpperSideFade=mix(1.0,coloredSideShape,upperFadeProgress*.3);
      body*=coloredUpperSideFade;
      veil*=coloredUpperSideFade;
      rim*=coloredUpperSideFade;
      float thermal=fbm(vec2(h*4.0-flow*1.7,(x-overlayCenter)*9.0+t*.11));
      float thermalBroad=fbm(vec2(h*2.3-flow*.86,(x-overlayCenter)*4.2-t*.07));
      float thermalFine=fbm(vec2(h*6.7-flow*2.1,(x-overlayCenter)*12.0-t*.13));
      float movingHeat=smoothstep(.16,.84,thermal);
      float movingBroad=smoothstep(.12,.88,thermalBroad);
      float movingFine=smoothstep(.2,.8,thermalFine);
      float emissionZone=clamp(.56*movingHeat+.3*movingBroad+.14*movingFine,0.0,1.0);
      float transient=.86+.34*emissionZone+.12*movingBroad;
      float fade=.48+.28*(1.0-ch);
      vec3 butane=vec3(.065,.155,.35);
      vec3 blueHot=vec3(.19,.35,.54);
      float blueFlow=.9+.16*fbm(vec2(h*3.4-flow*1.35,x*7.0+t*.08));
      vec3 butaneLayer=(butane*blueVeil*.2+mix(butane,blueHot,.3)*blueBody*.62)*blueFlow;
      float innerVertical=smoothstep(-.01,.035,h)*(1.0-smoothstep(.27,.43,h));
      float innerWidth=max(.002,baseShape*mix(.34,.17,smoothstep(0.0,.43,h)));
      float innerEdgeWave=(sin(t*.86+h*9.1)*.0024+fine*.0016)*smoothstep(.02,.4,h);
      float innerBreath=1.0+.035*sin(t*.72+h*11.0)+fine*.025;
      float innerD=abs(x-sway*.34-innerEdgeWave)/max(.001,innerWidth*innerBreath);
      float innerBody=(1.0-smoothstep(.3,1.24,innerD))*innerVertical;
      float innerGlow=(1.0-smoothstep(.72,1.68,innerD))*innerVertical;
      vec3 innerBlue=mix(vec3(.12,.58,.94),vec3(.62,.96,1.0),1.0-smoothstep(0.0,.3,h));
      float tintLuma=dot(tint,vec3(.299,.587,.114));
      vec3 vividTint=clamp(vec3(tintLuma)+(tint-vec3(tintLuma))*1.34,0.0,1.0);
      vividTint=min(vec3(1.0),vividTint*1.12);
      float lateralBlend=smoothstep(.16,1.02,overlayD);
      float lateralDensity=1.0-lateralBlend*.62;
      vec3 blendedTint=mix(vividTint,mix(butane,blueHot,.58),lateralBlend*.72);
      vec3 hotCore=mix(vividTint,vec3(1.0,.78,.28),.2);
      float temperature=clamp(.08+center*.18+movingHeat*.38+movingBroad*.25+movingFine*.16,0.0,1.0);
      vec3 luminousCore=mix(hotCore,vec3(1.0),movingFine*.1);
      vec3 warm=mix(blendedTint*.94,luminousCore,temperature*(.72-lateralBlend*.16));
      float coloredBrightness=1.42;
      vec3 colored=(blendedTint*veil*.2+warm*body*(fade+.16)+blendedTint*rim*.15)*transient*coloredBrightness*lateralDensity*coloredOpacity;
      vec3 color=colored;
      color+=luminousCore*body*(emissionZone*.1+movingFine*.045)*coloredBrightness*coloredOpacity;
      float shellFront=clamp(blueBody*.62+blueVeil*.18,0.0,1.0);
      color=color*(1.0-shellFront*.28)+butaneLayer;
      float innerColorContact=clamp(body*.72+veil*.2,0.0,1.0)*coloredOpacity;
      vec3 mixedInner=mix(innerBlue,mix(innerBlue,warm,.5),innerColorContact);
      color=color*(1.0-innerBody*.3)+mixedInner*innerBody*(.5+.12*blueFlow)+mixedInner*innerGlow*.11;
      float coloredAlpha=clamp(veil*.1+body*(.44+.18*emissionZone+.09*movingFine),0.0,.72)*mix(1.0,.32,lateralBlend)*coloredOpacity;
      float blueAlpha=clamp(blueVeil*.15+blueBody*.42+innerBody*.4+innerGlow*.16,0.0,.78);
      float alpha=clamp(coloredAlpha+blueAlpha-coloredAlpha*blueAlpha,0.0,.86);
      gl_FragColor=vec4(color,alpha);
    }`;
  let canvas=byId('flame'), gl=null, ctx=null, program=null, uniforms=null;
  const stage=canvas.parentElement;
  const sampleImage=stage.querySelector('.sample-image');
  const sampleFixture=stage.querySelector('.sample-fixture');
  const rodGlowImage=stage.querySelector('.rod-glow-image');
  const rodFillImage=stage.querySelector('.rod-fill-image');
  const rodHandle=stage.querySelector('.rod-drag-handle');
  const saltMarker=stage.querySelector('.salt-marker');
  const jarHotspot=byId('jar-hotspot');
  rodGlowImage.src=sampleImage.src;
  rodFillImage.src=sampleImage.src;
  jarHotspot.addEventListener('click',showReagentFormula);
  const colorVector=color=>(color??'#000000').match(/[a-f\d]{2}/gi).map(s=>parseInt(s,16)/255);
  const rgb=()=>colorVector(current?.color);
  const coloredOpacity=()=>{
    if(colorFadeOutStartedAt!==null)return Math.max(0,colorFadeOutFrom*(1-(time-colorFadeOutStartedAt)/colorFadeOutDuration));
    return colorFadeStartedAt===null?0:Math.min(1,(time-colorFadeStartedAt)/COLOR_FADE_DURATION);
  };
  function shader(kind, source) {
    const s=gl.createShader(kind); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  try {
    gl=canvas.getContext('webgl',{alpha:true,antialias:false,preserveDrawingBuffer:true,premultipliedAlpha:false});
    if(!gl) throw new Error('WebGL unavailable');
    program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    uniforms=Object.fromEntries(['resolution','flameOrigin','outletRadius','samplePosition','sampleRadius','sampleActive','withdrawalFront','revealFront','coloredOpacity','time','tint'].map(n=>[n,gl.getUniformLocation(program,n)]));
  } catch {
    useFallback();
  }
  function useFallback() {
    gl=null;
    const replacement=canvas.cloneNode(false); canvas.replaceWith(replacement); canvas=replacement;
    ctx=canvas.getContext('2d');
  }
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault(); useFallback(); resize();
  });

  let rodOffsetX=0,rodOffsetY=0;
  const PLUME_FRONT_SPEED=5;
  let lastColoredSample=null,withdrawalStartedAt=null,withdrawalSampleH=-1,revealStartedAt=null,lastSampleInside=false,exitRevealFront=-1;

  function resetColoredPlume() {
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

  function sampleIsInsideFlame(geometry) {
    if(!current)return false;
    const h=(geometry.sampleY-geometry.y)/(canvas.height*.408);
    if(h<0||h>1.02)return false;
    const cap=Math.sqrt(Math.max(0,1-Math.pow(Math.max(0,(h-.88)/.17),2)));
    const mouth=geometry.radius;
    const width=(mouth*(1.08-.58*Math.max(0,Math.min(1,h)))+canvas.height*.04576*Math.pow(Math.max(0,1-h),.72)*smoothUnit(-.02,.12,h))*cap*.75;
    return Math.abs(geometry.sampleX-geometry.x)<=Math.max(0,width);
  }

  function updateRodInteractionGlow(isInside){
    if(isInside){rodOutsideSince=null;return;}
    if(!rodHasMoved)return;
    if(rodOutsideSince===null)rodOutsideSince=time;
    if(time-rodOutsideSince>=5){
      rodHasMoved=false;
      rodOutsideSince=null;
      sampleFixture.classList.remove('rod-moved');
    }
  }

  function resolveColoredPlume(geometry) {
    const sampleInside=!selectionBusy&&sampleIsInsideFlame(geometry);
    setSpectrumTarget(sampleInside?1:0);
    updateRodInteractionGlow(sampleInside);
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
      const sampleH=(geometry.sampleY-geometry.y)/(canvas.height*.408);
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
      const sampleH=(held.sampleY-held.y)/(canvas.height*.408);
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
    return {geometry,active:false,front:-1,revealFront:-1};
  }

  function drawFallback() {
    const w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const plume=resolveColoredPlume(flameGeometry());
    const geometry=plume.geometry;
    const base=h-geometry.y;
    const rawColor=rgb();
    const colorLuma=rawColor[0]*.299+rawColor[1]*.587+rawColor[2]*.114;
    const color=rawColor.map(value=>Math.round(Math.min(1,Math.max(0,colorLuma+(value-colorLuma)*1.34))*255));
    const sampleActive=plume.active;
    const flow=time*7.2;
    const swayFlow=flow*2.65;
    const shapeSignal=.5+Math.sin(time*.55+1.4)*.26+Math.sin(time*1.07+4.2)*.15+Math.sin(time*1.71+.3)*.09;
    const shapeUnit=Math.max(0,Math.min(1,(shapeSignal-.58)/.28));
    const shapePulse=shapeUnit*shapeUnit*(3-2*shapeUnit);
    const height=h*.408*(1+shapePulse*.06);
    const widthScale=1+shapePulse*.07;
    const sampleStop=Math.max(.04,Math.min(.98,(geometry.sampleY-geometry.y)/height));
    const envelopeAt=v=>{
      const cap=Math.sqrt(Math.max(0,1-Math.pow(Math.max(0,(v-.88)/.17),2)));
      return (geometry.radius*(1.08-.58*Math.max(0,Math.min(1,v)))+h*.04576*Math.pow(Math.max(0,1-v),.72)*smoothstep(-.02,.12,v))*cap*widthScale;
    };
    const smoothstep=(a,b,value)=>{
      const unit=Math.max(0,Math.min(1,(value-a)/(b-a)));
      return unit*unit*(3-2*unit);
    };
    const randomWave=(position,seed)=>{
      const cell=Math.floor(position),fraction=position-cell;
      const blend=fraction*fraction*(3-2*fraction);
      const value=index=>{
        const raw=Math.sin((index+seed)*12.9898)*43758.5453;
        return (raw-Math.floor(raw))*2-1;
      };
      return value(cell)+(value(cell+1)-value(cell))*blend;
    };
    const activityThreshold=-.08+(.5+.5*randomWave(time*.23,91.7))*.28;
    const movementActivity=smoothstep(activityThreshold,activityThreshold+.38,randomWave(time*1.45,71.3));
    const idleDrift=randomWave(time*.34,15.2)*.003;
    const swayAt=v=>{
      const chaoticBroad=randomWave(swayFlow*.48+v*1.4,3.7)*.013;
      const chaoticFast=randomWave(swayFlow*1.16-v*2.3,8.4)*.0065;
      const chaoticCross=randomWave(swayFlow*.77+v*3.9,19.6)*.003;
      const activeSway=(chaoticBroad+chaoticFast+chaoticCross+Math.sin(v*8.3-swayFlow*.61)*.002)*movementActivity;
      return (idleDrift+activeSway)*v*h*.82;
    };
    const sampleEnvelope=Math.max(.6,envelopeAt(sampleStop))*.75;
    const sampleLateral=Math.max(-1,Math.min(1,(geometry.sampleX-geometry.x-swayAt(sampleStop)*.75)/sampleEnvelope));
    const shoulderV=Math.max(sampleStop,Math.min(.68,Math.max(.52,sampleStop+.28)));
    const shoulderWidth=Math.max(.6,envelopeAt(shoulderV))*.75;
    const coloredEnd=.95;
    const shape=(v,scale,colored=false)=>{
      const envelope=envelopeAt(v);
      const sway=swayAt(v);
      if(!colored)return {width:Math.max(.6,envelope)*scale*.75,center:geometry.x+sway*.75};
      const progress=Math.max(0,Math.min(1,(v-sampleStop)/Math.max(.05,coloredEnd-sampleStop)));
      const growth=smoothstep(-.12,.3,progress);
      const narrowing=smoothstep(.52,1.15,progress);
      const currentWidth=Math.max(.6,envelope)*.75;
      const expandedWidth=geometry.sampleRadius+(shoulderWidth*.64-geometry.sampleRadius)*growth;
      const topSupport=shoulderWidth*.1*smoothstep(.72,1.02,v);
      const coloredClipWidth=Math.max(currentWidth,topSupport);
      const taperedWidth=Math.max(geometry.sampleRadius*.55,coloredClipWidth*.64);
      const upperSlimming=1-.16*smoothstep(.78,1,progress);
      const withdrawalWidth=plume.front>=0?Math.max(.08,smoothstep(plume.front-.018,plume.front+.2,v)):1;
      const revealWidth=plume.revealFront>=0?Math.max(.08,smoothstep(v-.018,v+.2,plume.revealFront)):1;
      const transitionWidth=plume.front>=0&&plume.revealFront>=0?Math.max(withdrawalWidth,revealWidth):Math.min(withdrawalWidth,revealWidth);
      const width=(expandedWidth+(taperedWidth-expandedWidth)*narrowing)*upperSlimming*scale*transitionWidth;
      const curve=progress*progress*(3-2*progress);
      const target=geometry.x+sway*.75+sampleLateral*shoulderWidth*.3;
      const curvedInward=-sampleLateral*shoulderWidth*.16*Math.sin(curve*Math.PI);
      const upperMotion=(Math.sin(flow*.62+v*5.1)*.0035+Math.sin(v*11-flow*.9)*.0022)*h*smoothstep(.36,.88,progress)*.75;
      return {
        width,
        center:geometry.sampleX+(target-geometry.sampleX)*curve+curvedInward+upperMotion+(.75*(Math.sin(progress*6.0+flow*.77)*.0015+Math.sin(v*17-flow*1.9)*.001)*h*progress)
      };
    };
    const trace=(from,scale,colored,fill=true,plumeClip=false,inner=false)=>{
      ctx.beginPath();
      const concurrent=plume.front>=0&&plume.revealFront>=0;
      const end=colored?(plume.revealFront>=0&&!concurrent?Math.min(coloredEnd,plume.revealFront):coloredEnd):(plumeClip?coloredEnd:1);
      const arcHeight=colored?Math.max(0,Math.min(.04,(end-from)*.08)):0;
      for(let side=-1;side<=1;side+=2){
        for(let i=0;i<=48;i++){
          const unit=(side===-1?i:48-i)/48;
          const start=from+arcHeight;
          const v=start+(end-start)*unit;
          const point=shape(v,scale,colored);
          if(plumeClip&&!colored){
            const boundarySupport=shoulderWidth*.42*smoothstep(.68,1.02,v)*scale;
            point.width=Math.max(point.width,boundarySupport);
          }
          if(inner&&!colored){
            point.center+=(Math.sin(flow*.86+v*9.1)*.0024+Math.sin(v*19-flow*1.1)*.0012)*h*smoothstep(.02,.4,v);
            point.width*=1+.035*Math.sin(flow*.72+v*11);
          }
          const px=point.center+side*point.width,py=base-v*height;
          if(side===-1&&i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
        }
      }
      if(colored){
        for(let i=0;i<=24;i++){
          const lateral=1-i/12;
          const arc=1-Math.sqrt(Math.max(0,1-lateral*lateral));
          const v=from+arcHeight*arc;
          const point=shape(v,scale,true);
          ctx.lineTo(point.center+lateral*point.width,base-v*height);
        }
      }
      ctx.closePath();
      if(fill)ctx.fill();
    };
    ctx.globalCompositeOperation='screen';
    if(sampleActive){
      const concurrent=plume.front>=0&&plume.revealFront>=0;
      const coloredFrom=plume.front>=0&&!concurrent?Math.min(coloredEnd,Math.max(sampleStop,plume.front)):sampleStop;
      const visibleEnd=plume.revealFront>=0&&!concurrent?Math.min(coloredEnd,plume.revealFront):coloredEnd;
      if(coloredFrom<visibleEnd){
        ctx.save();
        ctx.globalAlpha=coloredOpacity();
        trace(0,1.18,false,false,true);ctx.clip();
        for(let layer=0;layer<8;layer++){
          const scale=1-layer*.07;
          const layerDensity=.18+layer*.117;
          const gradient=ctx.createLinearGradient(w/2,base-coloredFrom*height,w/2,base-height*visibleEnd);
          const shift=Math.sin(flow*.73+layer*.41)*.035;
          const pulse=.5+.5*Math.sin(flow*.91+layer*.57);
          gradient.addColorStop(0,`rgba(${color},${(plume.front>=0?0:.07)*layerDensity})`);
          if(plume.front>=0)gradient.addColorStop(.08,`rgba(${color},${.07*layerDensity})`);
          gradient.addColorStop(.17+shift,`rgba(${color},${(.105+pulse*.08)*layerDensity})`);
          gradient.addColorStop(.44-shift*.45,`rgba(${color},${(.1+(1-pulse)*.078)*layerDensity})`);
          gradient.addColorStop(.72+shift*.35,`rgba(${color},${(.095+pulse*.07)*layerDensity})`);
          gradient.addColorStop(1,`rgba(${color},0)`);
          ctx.fillStyle=gradient;trace(coloredFrom,scale,true);
        }
        ctx.restore();
      }
    }
    for(let layer=0;layer<8;layer++) {
      const scale=1-layer*.028;
      const gradient=ctx.createLinearGradient(w/2,base,w/2,base-height*scale);
      gradient.addColorStop(0,'rgba(55,99,166,.072)');
      gradient.addColorStop(.56,'rgba(38,80,145,.06)');
      gradient.addColorStop(1,'rgba(24,48,94,0)');
      ctx.fillStyle=gradient;trace(0,scale,false);
    }
    for(let layer=0;layer<8;layer++){
      const scale=.39-layer*.033;
      const gradient=ctx.createLinearGradient(w/2,base,w/2,base-height*.43);
      const softness=1-layer/10;
      gradient.addColorStop(0,`rgba(170,245,255,${.16+.24*(1-softness)})`);
      gradient.addColorStop(.48,`rgba(52,166,244,${.1+.17*(1-softness)})`);
      gradient.addColorStop(1,'rgba(24,90,190,0)');
      ctx.fillStyle=gradient;trace(0,scale,false,true,false,true);
    }
    ctx.globalCompositeOperation='source-over';
  }
  function apparatusGeometry() {
    const rect={width:stage.clientWidth,height:stage.clientHeight};
    const image=stage.querySelector('.lab-background');
    const naturalWidth=image.naturalWidth||1536,naturalHeight=image.naturalHeight||1024;
    const backgroundZoom=1;
    const coverScale=Math.max(rect.width/naturalWidth,rect.height/naturalHeight);
    const coverOffsetX=(rect.width-naturalWidth*coverScale)/2;
    const coverOffsetY=(rect.height-naturalHeight*coverScale)/2;
    const scale=coverScale*backgroundZoom;
    const offsetX=rect.width/2+(coverOffsetX-rect.width/2)*backgroundZoom;
    const offsetY=coverOffsetY*backgroundZoom;
    const x=offsetX+naturalWidth*.494*scale;
    const openingY=offsetY+naturalHeight*.424*scale;
    const sampleX=rect.width*.08;
    const sampleY=offsetY+naturalHeight*.795*scale;
    const rodHeight=Math.min(100,rect.width*.56/3);
    const rodAspect=sampleImage.naturalWidth&&sampleImage.naturalHeight?sampleImage.naturalWidth/sampleImage.naturalHeight:3.84;
    const rodWidth=rodHeight*rodAspect;
    const rodSaltX=rodHeight*.117;
    const rodSaltY=rodHeight*.476;
    const handleX=rodHeight*1.2;
    const handleY=rodHeight*.3;
    const handleWidth=rodWidth-handleX-rodHeight*.06;
    const handleHeight=rodHeight*.38;
    const saltRadius=Math.max(1.7,rodHeight*.033);
    const jarX=offsetX+naturalWidth*.205*scale;
    const jarY=offsetY+naturalHeight*.268*scale;
    const jarWidth=naturalWidth*.119*scale;
    const jarHeight=naturalHeight*.438*scale;
    stage.style.setProperty('--apparatus-x',`${x}px`);
    stage.style.setProperty('--sample-x',`${sampleX}px`);
    stage.style.setProperty('--sample-y',`${sampleY}px`);
    stage.style.setProperty('--rod-width',`${rodWidth}px`);
    stage.style.setProperty('--rod-height',`${rodHeight}px`);
    stage.style.setProperty('--rod-salt-x',`${rodSaltX}px`);
    stage.style.setProperty('--rod-salt-y',`${rodSaltY}px`);
    stage.style.setProperty('--rod-handle-x',`${handleX}px`);
    stage.style.setProperty('--rod-handle-y',`${handleY}px`);
    stage.style.setProperty('--rod-handle-width',`${handleWidth}px`);
    stage.style.setProperty('--rod-handle-height',`${handleHeight}px`);
    stage.style.setProperty('--salt-radius',`${saltRadius}px`);
    stage.style.setProperty('--salt-size',`${saltRadius*2}px`);
    stage.style.setProperty('--jar-x',`${jarX}px`);
    stage.style.setProperty('--jar-y',`${jarY}px`);
    stage.style.setProperty('--jar-width',`${jarWidth}px`);
    stage.style.setProperty('--jar-height',`${jarHeight}px`);
    return {x,openingY,sampleX,sampleY,rodWidth,rodHeight,rodSaltX,rodSaltY,handleX,handleWidth,saltRadius,radius:naturalWidth*.021*scale};
  }
  function flameGeometry() {
    const canvasRect=canvas.getBoundingClientRect();
    const apparatus=apparatusGeometry();
    const salt=saltMarker.getBoundingClientRect();
    return {
      x:apparatus.x*(canvas.width/canvasRect.width),
      y:(canvasRect.height-apparatus.openingY)*(canvas.height/canvasRect.height),
      radius:apparatus.radius*(canvas.width/canvasRect.width),
      sampleX:(salt.left+salt.width*.5-canvasRect.left)*(canvas.width/canvasRect.width),
      sampleY:(canvasRect.bottom-(salt.top+salt.height*.32))*(canvas.height/canvasRect.height),
      sampleRadius:salt.width*.5*(canvas.width/canvasRect.width)
    };
  }
  function render() {
    if(!canvas.width||!canvas.height)return;
    if(gl){
      const plume=resolveColoredPlume(flameGeometry());
      const geometry=plume.geometry;
      gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);
      gl.uniform2f(uniforms.flameOrigin,geometry.x,geometry.y);
      gl.uniform1f(uniforms.outletRadius,geometry.radius);
      gl.uniform2f(uniforms.samplePosition,geometry.sampleX,geometry.sampleY);
      gl.uniform1f(uniforms.sampleRadius,geometry.sampleRadius);
      gl.uniform1f(uniforms.sampleActive,plume.active?1:0);
      gl.uniform1f(uniforms.withdrawalFront,plume.front);
      gl.uniform1f(uniforms.revealFront,plume.revealFront);
      gl.uniform1f(uniforms.coloredOpacity,coloredOpacity());
      gl.uniform1f(uniforms.time,time);
      gl.uniform3fv(uniforms.tint,rgb()); gl.drawArrays(gl.TRIANGLES,0,6);
    } else if(ctx) drawFallback();
  }
  function setRodOffset(x,y) {
    const geometry=apparatusGeometry();
    const rect={width:stage.clientWidth,height:stage.clientHeight};
    const handleLeft=geometry.sampleX-geometry.rodSaltX+geometry.handleX;
    const handleWidth=geometry.handleWidth;
    const minimumVisibleHandle=Math.min(28,handleWidth*.35);
    const minimumX=minimumVisibleHandle-handleLeft-handleWidth;
    const maximumX=rect.width-minimumVisibleHandle-handleLeft;
    rodOffsetX=Math.max(minimumX,Math.min(maximumX,x));
    const naturalTop=geometry.sampleY-geometry.rodSaltY;
    const visibleTop=naturalTop+geometry.rodHeight*.3812;
    const visibleBottom=naturalTop+geometry.rodHeight*.5733;
    rodOffsetY=Math.max(-visibleTop,Math.min(rect.height-visibleBottom,y));
    stage.style.setProperty('--rod-offset-x',`${rodOffsetX}px`);
    stage.style.setProperty('--rod-offset-y',`${rodOffsetY}px`);
  }
  let drag=null;
  rodHandle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();
    drag={x:event.clientX,y:event.clientY,offsetX:rodOffsetX,offsetY:rodOffsetY};
    rodHandle.classList.add('is-dragging');
    rodHandle.setPointerCapture(event.pointerId);
  });
  rodHandle.addEventListener('pointermove',event=>{
    if(!drag||!rodHandle.hasPointerCapture(event.pointerId))return;
    const previousX=rodOffsetX,previousY=rodOffsetY;
    setRodOffset(drag.offsetX+event.clientX-drag.x,drag.offsetY+event.clientY-drag.y);
    if(!rodHasMoved&&Math.hypot(rodOffsetX-previousX,rodOffsetY-previousY)>.5){
      rodHasMoved=true;
      rodOutsideSince=null;
      sampleFixture.classList.add('rod-moved');
    }
    render();
  });
  const endDrag=event=>{
    if(!drag)return;
    drag=null;
    rodHandle.classList.remove('is-dragging');
    if(rodHandle.hasPointerCapture(event.pointerId))rodHandle.releasePointerCapture(event.pointerId);
  };
  rodHandle.addEventListener('pointerup',endDrag);
  rodHandle.addEventListener('pointercancel',endDrag);
  sampleImage.addEventListener('dragstart',event=>event.preventDefault());
  function resize() {
    const rect=canvas.getBoundingClientRect();
    const pixelRatio=Math.min(1.5,window.devicePixelRatio||1);
    canvas.width=Math.max(1,Math.round(rect.width*pixelRatio));canvas.height=Math.max(1,Math.round(rect.height*pixelRatio));
    setRodOffset(rodOffsetX,rodOffsetY);
    if(gl)gl.viewport(0,0,canvas.width,canvas.height);
    render();drawSpectrum();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  new ResizeObserver(drawSpectrum).observe(byId('spectrum').parentElement);
  canvas.parentElement.querySelectorAll('img').forEach(image=>image.addEventListener('load',resize,{once:true}));
  let previous=0;
  function animate(now){
    if(now-previous>=1000/30){
      const dt=Math.min(.1,(now-previous)/1000);previous=now;
      if(!document.hidden){
        time+=dt;
        render();
        if(spectrumTransition){
          const before=spectrumReveal;
          const progress=Math.min(1,(time-spectrumTransition.startedAt)/SPECTRUM_TRANSITION_DURATION);
          const eased=progress*progress*(3-2*progress);
          spectrumReveal=spectrumTransition.from+(spectrumTransition.to-spectrumTransition.from)*eased;
          if(progress>=1)spectrumTransition=null;
          if(Math.abs(spectrumReveal-before)>.0001)drawSpectrum();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  async function waitForImage(image){
    if(image.complete&&image.naturalWidth)return;
    try{await image.decode();}catch{
      if(!image.complete||!image.naturalWidth)await new Promise(resolve=>image.addEventListener('load',resolve,{once:true}));
    }
  }
  async function revealViewer(){
    const images=[byId('lab-background'),sampleImage,rodGlowImage,rodFillImage];
    await Promise.all([...images.map(waitForImage),document.fonts?.ready??Promise.resolve()]);
    resize();
    requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelector('.app').classList.add('is-ready')));
  }
  if(current)applyElement(current);else initializeNeutralState();
  resize();requestAnimationFrame(animate);revealViewer();
})();
