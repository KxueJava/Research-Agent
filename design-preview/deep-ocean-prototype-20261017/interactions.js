function closePopover(){document.querySelector('.popover')?.remove();popoverAnchor=null;}
function toast(message){clearTimeout(toastTimer);$('#toast-root').innerHTML=`<div class="toast">${icon('check')}<span>${E(message)}</span></div>`;toastTimer=setTimeout(()=>$('#toast-root').replaceChildren(),3200);}
function dialog(title,body,footer='',wide=false){closePopover();dialogReturnFocus=document.activeElement;const html=`<div class="overlay-backdrop"><section class="dialog ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-header"><h2 id="dialog-title">${title}</h2>${ib('close','关闭弹窗','close-dialog')}</header><div class="dialog-content">${body}</div>${footer?`<footer class="dialog-footer">${footer}</footer>`:''}</section></div>`;$('#overlay-root').innerHTML=html.replaceAll('id="field-','id="dialog-field-').replaceAll('for="field-','for="dialog-field-');queueMicrotask(()=>$('.dialog input:not([type=hidden]),.dialog button,.dialog select')?.focus());}
function closeDialog(){const activeImage=$('#mask-canvas');if(activeImage)activeImage.onpointermove=null;$('#overlay-root').replaceChildren();if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus();}
function confirmDialog(title,description,onConfirm){dialog(title,`<p>${E(description)}</p>`,button('取消','close-dialog')+button('确认删除','confirm-delete','trash','danger'));$('.dialog [data-action=confirm-delete]').addEventListener('click',()=>{onConfirm();closeDialog();},{once:true});}
function popover(anchor,html){closePopover();popoverAnchor=anchor;const el=document.createElement('div');el.className='popover';el.innerHTML=html;el.setAttribute('role','group');el.setAttribute('aria-label','选项');document.body.append(el);const r=anchor.getBoundingClientRect(),b=el.getBoundingClientRect();el.style.left=Math.max(10,Math.min(innerWidth-b.width-10,r.left))+'px';el.style.top=(r.bottom+b.height+9>innerHeight?Math.max(10,r.top-b.height-8):r.bottom+8)+'px';}
function popItem(label,action,ico='',attrs='',extra=''){return `<button type="button" class="menu-item" data-action="${action}" ${attrs}>${ico?icon(ico):''}<span>${label}${extra?`<small style="display:block">${extra}</small>`:''}</span></button>`;}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function setTheme(theme){state.theme=theme==='light'?'light':'dark';document.documentElement.dataset.theme=state.theme;store('ocean-prototype-theme',state.theme);window.OceanPrototype?.themeChanged();$$('[data-action=theme]').forEach(b=>{b.innerHTML=icon(state.theme==='dark'?'sun':'moon');});$$('[data-action=set-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===state.theme));}
function setQuality(q){state.quality=q;store('ocean-prototype-quality',q);window.OceanPrototype?.setQuality(q);$$('[data-action=quality]').forEach(b=>b.classList.toggle('active',b.dataset.quality===q));}
function guide(){const engine=window.OceanPrototype?.getState();dialog('原型导航与显示',`<p>这是独立 HTML 原型，复用当前项目的导航与页面组织。所有研究结果、资料、配置和统计均为本地演示，不连接后端。选择页面可直接预览。</p><div class="page-links">${Object.entries(pageTitles).map(([v,t])=>button(t,'navigate','',v===state.view?'active':'',`data-view="${v}"`)).join('')}</div><h3 style="margin-bottom:10px">海洋主题</h3><div class="segmented" style="margin-bottom:23px"><button data-action="set-theme" data-theme="dark" class="${state.theme==='dark'?'active':''}">深色深海</button><button data-action="set-theme" data-theme="light" class="${state.theme==='light'?'active':''}">浅色浅海</button></div><h3>动态背景</h3>${qualityButtons()}<p class="caption">${engine?.fallback?'当前使用静态背景。系统减少动画偏好优先于画质选项。':'背景使用单个 Three.js WebGL 场景，桌面绘制上限 30 FPS，低动态模式 24 FPS。这里是上限设置，不是实测帧率。'}</p><div class="notice">快速体验：点击左侧历史任务查看 Agent 执行与报告；报告右边缘可拖动。聊天支持 Enter 发送、Shift + Enter 换行；Esc 关闭弹窗。</div>`,button('重置演示数据','reset-demo','refresh')+button('开始预览','close-dialog','','primary'),true);}
function render(){closePopover();document.documentElement.dataset.theme=state.theme;document.body.classList.toggle('sidebar-open',state.sidebarOpen);const views={home:welcome,chat,mrag,images,agents:agentsPage,models:modelPage,capabilities,usage,featured,sop,profile};$('#app').innerHTML=state.view==='login'?login():`<div class="shell">${sidebar()}<main class="main"><div class="mobile-bar">${ib('menu','打开导航','open-sidebar')}<strong>Research Agent</strong><span class="grow"></span>${ib('settings','原型导航与显示','guide')}</div>${(views[state.view]||welcome)()}</main></div>`;if($('#report-frame'))$('#report-frame').srcdoc=reportHTML();if(state.sidebarSearch)filterItems('sessions',state.search);document.title=`${pageTitles[state.view]||'对话'} — Research Agent 交互原型`;}
function go(view){if(!(view in pageTitles))view='home';state.view=view;state.sidebarOpen=false;state.accountOpen=false;closeDialog();render();if(location.hash.slice(1)!==view)location.hash=view;}
function openSession(id){const s=sessions.find(x=>x.id===id);if(!s)return;state.job++;state.busy=false;state.task={...s,query:s.query||s.title};state.turns=[...(s.turns||[])];state.workspace=s.kind!=='java';state.workspaceTab='preview';state.draft='';go('chat');}
function startTask(text,kind,regenerate=false){const value=String(text||'').trim();if(!value&&!state.attachments.length){toast('先输入任务，或添加附件。');return;}const query=value||`分析附件：${state.attachments.map(f=>f.name).join('、')}`;const followUp=state.view==='chat'&&Boolean(state.task);if(followUp&&!regenerate){state.turns.push({query:state.task.query||state.task.title,body:researchBody()});}if(!followUp)state.turns=[];const task=followUp?{...state.task,query,stopped:false,kind:kind||state.task.kind}:{id:++sessionSeq,title:query.slice(0,28),query,kind:kind||(/销售|CSV|收入|数据分析/i.test(query)?'sales':'research'),pinned:false};task.turns=[...state.turns];if(followUp){const i=sessions.findIndex(s=>s.id===task.id);if(i>=0)sessions[i]=task;}else sessions.unshift(task);state.task=task;state.draft='';state.attachments=[];state.workspace=false;state.busy=true;const job=++state.job;go('chat');const messages=['已拆解研究问题，正在整理演示来源…','正在对照核心维度，并生成分析结果…','正在组织报告和可视化内容…'];messages.forEach((message,i)=>setTimeout(()=>{if(state.job===job&&state.busy&&state.view==='chat'&&$('#answer-body'))$('#answer-body').innerHTML=`<p class="soft">${message}</p>`;},400+i*500));setTimeout(()=>{if(state.job!==job||!state.busy)return;state.busy=false;if(state.view==='chat')render();},2100);}
function filterItems(group,value){const needle=String(value).trim().toLowerCase();const selector=group==='sessions'?'[data-session-row]':`[data-searchable="${group}"]`;for(const el of $$(selector)){const text=group==='sessions'?el.dataset.title:el.textContent.toLowerCase();el.hidden=!text.includes(needle);}}
function newModel(){dialog('新增模型',`<form id="dialog-form" data-form="new-model">${input('模型标识','name','','text','','required placeholder="例如 qwen-plus"')}${choose('服务商预设','provider',['阿里云百炼','OpenAI 兼容'],'阿里云百炼')}${input('Base URL','url','https://dashscope.aliyuncs.com/compatible-mode/v1','url','','required')}<div class="notice">此处不需要真实 API Key。新增模型仅保存在本次原型会话中。</div></form>`,button('取消','close-dialog')+button('添加模型','dialog-save','','primary'));}
function newAgent(){dialog('新增子 Agent',`<form id="dialog-form" data-form="new-agent">${input('名称','name','','text','','required placeholder="例如 行业研究员"')}${input('说明','desc','','text','','required placeholder="描述这个 Agent 擅长的任务"')}<div class="field"><label for="new-agent-prompt">系统提示词</label><textarea id="new-agent-prompt" name="prompt" class="field-input" required placeholder="描述角色、工作方式与交付要求。"></textarea></div></form>`,button('取消','close-dialog')+button('创建子 Agent','dialog-save','','primary'));}
function editCapability(id){const isMcp=state.capTab==='MCP';const c=(isMcp?connections:skills).find(x=>x.id===id);const name=c?.name||'';dialog(c?'配置 '+E(name):isMcp?'添加 MCP':'添加 Skill',`<form id="dialog-form" data-form="capability" data-id="${id||0}">${input('名称','name',name,'text','','required')}${input('说明','desc',c?.desc||'')}${isMcp?choose('传输协议','transport',['Streamable HTTP','SSE','STDIO'],c?.type||'Streamable HTTP')+input('服务地址 / 启动命令','url',c?.url||'','text','只校验演示字段，不会建立连接或启动进程。','required'):input('Skill 路径','path','skills/example/SKILL.md','text','仅展示配置入口，不写入正式项目。')}<p class="form-error" id="capability-error"></p></form>`,button('取消','close-dialog')+button('保存','dialog-save','','primary'));}
function newKB(){dialog('创建知识库',`<form id="dialog-form" data-form="new-kb">${input('知识库名称','name','','text','','required maxlength="60" placeholder="例如 产品研究资料"')}${input('用途描述','description','','text','','placeholder="可选"')}</form>`,button('取消','close-dialog')+button('创建','dialog-save','','primary'));}
function documentPreview(index=0){const kb=selectedKB(),file=kb?.files[index];dialog(file?E(file.name):'来源摘要',`<span class="tag">${E(file?.type||'演示证据')}</span><article class="source-document"><h3>${E(file?.name||'公开产品资料')}</h3><p>${kb?.id===1?'Java 平台包含开发工具、运行环境和标准类库。Java 程序通常经过编译生成字节码，并在虚拟机上运行。':'研究资料可以帮助团队建立共同的分析口径。通过保留来源、原始内容和核验过程，让报告中的结论可以被检查。'}</p><p>此处为原型内置的示例正文，并非读取所上传文件或抓取网页的真实结果。</p></article><div class="notice">演示切片 001 / 共 ${file?.chunks||12} 个切片。正式项目的原文查看与检索契约保持不变。</div>`,button('关闭','close-dialog'));}
function askKB(){const kb=selectedKB();if(!kb){toast('请先创建或选择知识库。');return;}if(!kb.files.length){toast('请先上传文件或添加网页资料。');return;}if(!state.kbQuestion.trim()){toast('请输入问题。');return;}state.query=state.kbQuestion.trim();state.kbQuestion='';state.kbAnswer=true;render();}
function imagePreview(index){dialog('图片预览',`<div class="art-preview">${artwork(index)}</div><p class="caption">内置矢量示意图 / 仅用于确认图片预览与编辑流程。</p>`,button('下载 SVG','download-image','download','',`data-index="${index}"`)+button('编辑图片','edit-image','edit','primary',`data-index="${index}"`),true);}
function imageEditor(index){dialog('编辑图片',`<p>在图片上涂抹选区，再输入修改描述。原型支持本地涂抹，不会上传或编辑真实图片。</p><canvas id="mask-canvas" class="image-mask-canvas" width="800" height="600" aria-label="图片涂抹选区"></canvas><div class="toolbar"><label class="caption">笔刷大小 <input type="range" id="brush-size" min="8" max="80" value="28" style="width:100px;vertical-align:middle"></label>${button('清除选区','clear-mask','refresh','',`data-index="${index}"`)}</div><label class="field"><span>修改描述</span><input type="text" id="image-edit-prompt" placeholder="例如：将远处建筑改为浅色石材"></label>`,button('取消','close-dialog')+button('应用修改（演示）','apply-image-edit','','primary'),true);const canvas=$('#mask-canvas'),ctx=canvas.getContext('2d');const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,800,600);img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(artwork(index));let drawing=false;const draw=e=>{if(!drawing)return;const box=canvas.getBoundingClientRect();ctx.lineWidth=Number($('#brush-size').value)*(800/box.width);ctx.strokeStyle='rgba(112,206,223,.55)';ctx.lineCap='round';ctx.lineTo((e.clientX-box.left)*800/box.width,(e.clientY-box.top)*600/box.height);ctx.stroke();};canvas.onpointerdown=e=>{drawing=true;canvas.setPointerCapture(e.pointerId);ctx.beginPath();const b=canvas.getBoundingClientRect();ctx.moveTo((e.clientX-b.left)*800/b.width,(e.clientY-b.top)*600/b.height);draw(e);};canvas.onpointermove=draw;canvas.onpointerup=()=>drawing=false;canvas.onpointercancel=()=>drawing=false;}
function modelTest(){const f=$('form[data-form=model]');if(!f?.reportValidity())return;$('#connection-result').textContent='本地字段校验通过。未建立网络连接，未验证 API Key 或模型可用性。';toast('原型字段校验通过，未发起网络请求。');}
function showFiles(){dialog('当前会话的文件',state.task?`<button type="button" class="file-artifact" data-action="open-report">${icon('code')}<span><strong>${E(taskTitle())}.html</strong><small>HTML 演示报告</small></span><span class="grow"></span>${icon('right')}</button><p class="caption">点击文件打开工作区。原型中的下载内容为本地生成的示例文件。</p>`:'<div class="empty-state">'+icon('folder')+'<h3>暂无文件</h3><p>打开一条历史任务，或发送一个研究问题，查看演示产物。</p></div>',button('关闭','close-dialog'));}
function resetDemo(){try{['ocean-prototype-theme','ocean-prototype-quality','ocean-prototype-user','ocean-prototype-kb'].forEach(k=>localStorage.removeItem(k));}catch{}location.hash='home';location.reload();}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');
  if(!target){if(!event.target.closest('.popover'))closePopover();if(event.target.classList.contains('overlay-backdrop'))closeDialog();return;}
  const action=target.dataset.action,id=Number(target.dataset.id),index=Number(target.dataset.index||0);
  if(!['mode-menu','model-menu','effort-menu','session-menu','image-menu','format-menu'].includes(action))closePopover();
  switch(action){
    case 'navigate':go(target.dataset.view);break;
    case 'new-chat':state.job++;state.busy=false;state.task=null;state.turns=[];state.draft='';state.workspace=false;go('home');break;
    case 'theme':setTheme(state.theme==='dark'?'light':'dark');break;
    case 'set-theme':setTheme(target.dataset.theme);break;
    case 'quality':setQuality(target.dataset.quality);break;
    case 'guide':guide();break;
    case 'close-dialog':closeDialog();break;
    case 'dialog-save':$('.dialog form')?.requestSubmit();break;
    case 'account':state.accountOpen=!state.accountOpen;render();break;
    case 'profile':go('profile');break;
    case 'logout':dialog('退出登录','<p>退出后将展示原型登录页面，不会影响正式项目的登录状态。</p>',button('取消','close-dialog')+button('退出登录','confirm-logout','logout','primary'));break;
    case 'confirm-logout':go('login');break;
    case 'open-sidebar':state.sidebarOpen=true;document.body.classList.add('sidebar-open');break;
    case 'close-sidebar':state.sidebarOpen=false;document.body.classList.remove('sidebar-open');break;
    case 'sidebar-search':state.sidebarSearch=!state.sidebarSearch;render();$('.sidebar-search')?.focus();break;
    case 'session':openSession(id);break;
    case 'session-menu':{const s=sessions.find(x=>x.id===id);popover(target,popItem(s?.pinned?'取消置顶':'置顶任务','pin-session','pin',`data-id="${id}"`)+popItem('删除任务','delete-session','trash',`data-id="${id}"`));break;}
    case 'pin-session':{const s=sessions.find(x=>x.id===id);if(s)s.pinned=!s.pinned;render();break;}
    case 'delete-session':confirmDialog('删除任务','仅从本地原型中删除这条演示任务。',()=>{const i=sessions.findIndex(x=>x.id===id);if(i>=0)sessions.splice(i,1);if(state.task?.id===id){state.task=null;go('home');}else render();});break;
    case 'suggestion':state.draft=suggestions[index];render();$('#chat-input')?.focus();break;
    case 'send':startTask(state.draft);break;
    case 'stop':state.job++;state.busy=false;state.task.stopped=true;render();toast('已停止本地演示任务。');break;
    case 'regenerate':startTask(state.task?.query||taskTitle(),state.task?.kind,true);break;
    case 'mode-menu':popover(target,popItem('ReAct','choose-mode','brain','data-value="ReAct"','边思考边执行工具')+popItem('PlanExecute','choose-mode','search','data-value="PlanExecute"','先规划，再执行任务'));break;
    case 'choose-mode':state.mode=target.dataset.value;render();break;
    case 'data-mode':state.dataMode=!state.dataMode;render();break;
    case 'model-menu':popover(target,'<h3>模型</h3>'+models.filter(m=>m.enabled).map(m=>popItem(E(m.name),'choose-model',state.model===m.name?'check':'cpu',`data-value="${E(m.name)}"`,E(m.provider))).join('')+popItem('模型配置','navigate','settings','data-view="models"'));break;
    case 'choose-model':state.model=target.dataset.value;render();break;
    case 'effort-menu':popover(target,['low','medium','high'].map(v=>popItem(v,'choose-effort',state.effort===v?'check':'brain',`data-value="${v}"`)).join(''));break;
    case 'choose-effort':state.effort=target.dataset.value;render();break;
    case 'format-menu':popover(target,popItem('添加标题','insert-text','type','data-text="## "')+popItem('添加列表','insert-text','file','data-text="- "'));break;
    case 'insert-text':state.draft+=target.dataset.text;render();$('#chat-input')?.focus();break;
    case 'context':dialog('上下文占用','<p>此处展示上下文窗口的交互入口。原型不计算真实 Token 使用量。</p><div class="notice">模型：'+E(state.model)+'<br>演示占用：21%<br>正式项目继续使用当前的 SSE 上下文统计。</div>',button('关闭','close-dialog'));break;
    case 'attach':filePurpose='chat';$('#file-picker').click();break;
    case 'remove-attachment':state.attachments.splice(index,1);render();break;
    case 'files':showFiles();break;
    case 'open-report':if(!state.task){openSession(sessions[0]?.id);break;}state.workspace=true;state.workspaceTab='preview';if(state.view!=='chat')go('chat');else{closeDialog();render();}break;
    case 'sources':state.workspace=true;state.workspaceTab='sources';render();break;
    case 'workspace-tab':state.workspaceTab=target.dataset.tab;render();break;
    case 'close-workspace':state.workspace=false;render();break;
    case 'read-source':dialog('来源 '+(index+1),'查看与此结论关联的演示资料摘要。来源条目为虚构示例，不访问外部网站。',button('关闭','close-dialog'));break;
    case 'download-report':download(reportHTML(),'research-demo-report.html','text/html;charset=utf-8');toast('已下载 HTML 演示报告。');break;
    case 'copy-answer':navigator.clipboard?.writeText($('#answer-body')?.innerText||'').then(()=>toast('回答已复制。')).catch(()=>toast('浏览器限制复制，请选择文本手动复制。'));break;
    case 'favorite-chat':case 'feedback':target.classList.toggle('active');toast(action==='feedback'?'已记录演示反馈。':'已更新本地收藏状态。');break;
    case 'kb-toggle':state.kbOpen=!state.kbOpen;render();break;
    case 'new-kb':newKB();break;
    case 'delete-kb':confirmDialog('删除知识库','将删除本原型中的「'+(selectedKB()?.name||'知识库')+'」及其演示资料。不会修改正式项目。',()=>{knowledgeBases=knowledgeBases.filter(k=>k.id!==state.selectedKB);state.selectedKB=knowledgeBases[0]?.id??null;state.kbAnswer=false;saveKB();render();toast('演示知识库已删除。');});break;
    case 'kb-upload':filePurpose='kb';$('#file-picker').click();break;
    case 'kb-add-url':{const value=$('#kb-url')?.value.trim();if(!selectedKB()){toast('请先创建知识库。');break;}try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol))throw Error();selectedKB().files.push({name:u.hostname+u.pathname,type:'网页',chunks:8});saveKB();render();toast('已添加网页演示条目，未抓取网络内容。');}catch{toast('请输入以 http:// 或 https:// 开头的有效网址。');}break;}
    case 'kb-remove-file':{const f=selectedKB()?.files[index];if(f)confirmDialog('移除资料','从演示知识库中移除「'+f.name+'」。',()=>{selectedKB().files.splice(index,1);saveKB();render();});break;}
    case 'kb-document':documentPreview(index);break;
    case 'kb-suggestion':state.kbQuestion=selectedKB()?.id===1?'什么是 Java？':'整理这份资料的关键结论';askKB();break;
    case 'ask-kb':askKB();break;
    case 'mrag-debug':dialog('检索调试','<pre class="code-view">'+E(JSON.stringify({mode:'local prototype',knowledgeBase:selectedKB()?.name||null,documents:selectedKB()?.files.length||0,retrieval:'not executed',embedding:'not called'},null,2))+'</pre>',button('关闭','close-dialog'));break;
    case 'kb-evidence':if(selectedKB()?.files.length)documentPreview(0);else toast('当前知识库还没有资料。');break;
    case 'kb-history':dialog('问答历史',`<div class="search-results">${['什么是 Java？','如何配置 Java 开发环境？'].map(q=>`<button data-action="restore-kb-question" data-question="${q}">${icon('clock')}${q}</button>`).join('')}</div><p class="demo-note">内置演示历史</p>`,button('关闭','close-dialog'));break;
    case 'restore-kb-question':state.kbQuestion=target.dataset.question;closeDialog();askKB();break;
    case 'generate-image':{const text=$('#image-prompt').value.trim();if(!text){toast('请先描述希望生成的图片。');$('#image-prompt').focus();break;}state.imagePrompt=text;const imageRatio=$('#image-ratio').value,imageStyle=$('#image-style').value;target.disabled=true;target.innerHTML='<span class="spinner"></span>生成中';setTimeout(()=>{state.imageRecords.push({index:state.imageCount,prompt:text,ratio:imageRatio,style:imageStyle});state.imageCount++;state.imageTab='我的作品';if(state.view==='images')render();toast('已生成本地示意图，未调用图像模型。');},900);break;}
    case 'image-tab':state.imageTab=target.dataset.tab;render();break;
    case 'preview-image':imagePreview(index);break;
    case 'image-menu':popover(target,popItem('预览图片','preview-image','eye',`data-index="${index}"`)+popItem('编辑图片','edit-image','edit',`data-index="${index}"`)+popItem('下载 SVG','download-image','download',`data-index="${index}"`));break;
    case 'image-attach':filePurpose='image';$('#file-picker').click();break;
    case 'image-settings':dialog('生图设置',choose('模型','imageModel',['项目默认图像模型'],'项目默认图像模型')+input('生成数量','imageAmount','1','number','','min="1" max="4"')+'<div class="notice">原型不配置或调用真实图像模型。</div>',button('保存设置','close-dialog','','primary'));break;
    case 'download-image':download(artwork(index),'ocean-prototype-image.svg','image/svg+xml');toast('已下载矢量示意图。');break;
    case 'edit-image':case 'clear-mask':imageEditor(index);break;
    case 'apply-image-edit':if(!$('#image-edit-prompt').value.trim()){toast('请输入修改描述。');$('#image-edit-prompt').focus();}else{closeDialog();toast('编辑流程演示完成，未调用图像模型。');}break;
    case 'select-model':state.selectedModel=id;render();break;
    case 'new-model':newModel();break;
    case 'toggle-model':{const m=models.find(x=>x.id===id);m.enabled=!m.enabled;render();break;}
    case 'test-model':modelTest();break;
    case 'refresh-models':render();toast('已恢复当前演示配置。');break;
    case 'model-filter':$$('[data-action=model-filter]').forEach(b=>b.classList.toggle('active',b===target));filterItems('model-list',target.dataset.filterValue);break;
    case 'select-agent':state.selectedAgent=id;render();break;
    case 'new-agent':newAgent();break;
    case 'toggle-agent':{const a=agents.find(x=>x.id===id);a.enabled=!a.enabled;render();break;}
    case 'test-agent':dialog('子 Agent 试运行',`<p>将以「${E(agents.find(a=>a.id===state.selectedAgent)?.name)}」的配置展示一次演示任务。</p>${input('任务描述','agentTestTask','','text','','placeholder="输入希望委派的任务"')}`,button('取消','close-dialog')+button('开始演示','run-agent','','primary'));break;
    case 'run-agent':{const query=$('.dialog [name=agentTestTask]')?.value;if(!query?.trim()){toast('请输入任务描述。');break;}closeDialog();startTask(query);break;}
    case 'cap-tab':state.capTab=target.dataset.tab;render();break;
    case 'new-mcp':case 'new-skill':editCapability(0);break;
    case 'edit-cap':editCapability(id);break;
    case 'toggle-cap':{const c=(state.capTab==='MCP'?connections:skills).find(c=>c.id===id);c.enabled=!c.enabled;render();break;}
    case 'delete-cap':{const list=state.capTab==='MCP'?connections:skills;const c=list.find(x=>x.id===id);confirmDialog('删除能力','从本地原型中删除「'+(c?.name||'能力')+'」。',()=>{const i=list.findIndex(x=>x.id===id);if(i>=0)list.splice(i,1);render();});break;}
    case 'usage-period':state.usagePeriod=target.dataset.period;render();break;
    case 'export-usage':download('\ufeff模型,调用次数,输入Token,输出Token,预估费用（元）\n'+usageRows().map(row=>row.map(value=>String(value).replaceAll(',','')).join(',')).join('\n'),'usage-demo.csv','text/csv;charset=utf-8');toast('已导出演示 CSV。');break;
    case 'featured-filter':state.featureFilter=target.dataset.filterValue;render();break;
    case 'featured-open':{const f=featuredData.find(f=>f.kind===target.dataset.kind);const s=sessions.find(s=>s.kind===f.kind);if(s)openSession(s.id);else startTask(f.title,f.kind);break;}
    case 'sop-template':$$('[data-action=sop-template]').forEach(b=>b.classList.toggle('active',b===target));$('#sop-name').textContent=['研究报告','销售数据分析','知识库整理'][index];break;
    case 'run-sop':{const query=$('#sop-query').value.trim();if(!query){toast('请输入研究任务。');$('#sop-query').focus();break;}state.mode='PlanExecute';startTask(query);break;}
    case 'profile-tab':state.profileTab=target.dataset.tab;render();break;
    case 'login-mode':state.loginMode=state.loginMode==='login'?'register':'login';render();break;
    case 'login-help':dialog('登录帮助','<p>正式项目请使用已有 Research 账号登录，忘记密码时联系工作区管理员。此原型可填写任意演示用户名与至少 8 位演示密码体验流程。</p>',button('关闭','close-dialog'));break;
    case 'reset-demo':resetDemo();break;
  }
});
document.addEventListener('input',event=>{const t=event.target;if(t.dataset.draft==='chat'){state.draft=t.value;const send=t.closest('[data-composer]').querySelector('.send');send.disabled=!state.busy&&!state.draft.trim()&&!state.attachments.length;t.style.height='auto';t.style.height=Math.min(150,Math.max(48,t.scrollHeight))+'px';}if(t.dataset.draft==='mrag'){state.kbQuestion=t.value;t.closest('[data-composer]').querySelector('.send').disabled=!t.value.trim();}if(t.id==='image-prompt')state.imagePrompt=t.value;if(t.dataset.filter){if(t.dataset.filter==='sessions')state.search=t.value;filterItems(t.dataset.filter,t.value);}});
document.addEventListener('change',event=>{if(event.target.dataset.change==='kb'){state.selectedKB=Number(event.target.value)||null;state.kbAnswer=false;state.kbQuestion='';render();}});
document.addEventListener('submit',event=>{
  const form=event.target;if(!form.dataset.form)return;event.preventDefault();const d=new FormData(form),get=n=>String(d.get(n)||'').trim();
  switch(form.dataset.form){
    case 'new-model':{const name=get('name');if(models.some(m=>m.name===name)){toast('已有同名演示模型，请使用其他名称。');return;}const m={id:++modelSeq,name,provider:get('provider'),url:get('url'),enabled:true,context:'131072'};models.push(m);state.selectedModel=m.id;closeDialog();go('models');toast('已添加演示模型。');break;}
    case 'model':{const m=models.find(m=>m.id===state.selectedModel);if(models.some(x=>x.id!==m.id&&x.name===get('name'))){toast('已有同名演示模型。');return;}Object.assign(m,{name:get('name'),provider:get('provider'),url:get('url'),context:get('context')});render();toast('演示配置已保存；凭据未保存。');break;}
    case 'new-agent':{const a={id:++agentSeq,name:get('name'),desc:get('desc'),prompt:get('prompt'),tools:['网页检索','网页读取'],enabled:true};agents.push(a);state.selectedAgent=a.id;closeDialog();go('agents');toast('已创建演示子 Agent。');break;}
    case 'agent':{const a=agents.find(a=>a.id===state.selectedAgent);Object.assign(a,{name:get('name'),desc:get('desc'),prompt:get('prompt'),tools:d.getAll('tools')});render();toast('子 Agent 演示配置已保存。');break;}
    case 'new-kb':{const k={id:++kbSeq,name:get('name'),desc:get('description'),files:[]};knowledgeBases.push(k);state.selectedKB=k.id;state.kbOpen=true;state.kbAnswer=false;saveKB();closeDialog();go('mrag');toast('已创建本地演示知识库。');break;}
    case 'capability':{const isMcp=state.capTab==='MCP',list=isMcp?connections:skills,id=Number(form.dataset.id);if(isMcp&&get('transport')!=='STDIO'){try{const u=new URL(get('url'));if(!['http:','https:'].includes(u.protocol))throw Error();}catch{$('#capability-error').textContent='请输入有效的 http:// 或 https:// 服务地址。';return;}}let c=list.find(c=>c.id===id);if(!c){c={id:Math.max(0,...list.map(c=>c.id))+1,enabled:true,tools:0};list.push(c);}Object.assign(c,{name:get('name'),desc:get('desc'),type:get('transport'),url:get('url')});closeDialog();render();toast('演示能力配置已保存，未建立服务连接。');break;}
    case 'profile':state.userName=get('username');store('ocean-prototype-user',state.userName);render();toast('个人资料已保存在本地原型。');break;
    case 'password':if(get('newPassword')!==get('confirmPassword')){$('#password-error').textContent='两次输入的新密码不一致。';return;}form.reset();toast('密码表单演示完成，未修改或保存真实密码。');break;
    case 'login':if(state.loginMode==='register'&&get('password')!==get('confirmPassword')){$('#login-error').textContent='两次输入的密码不一致。';return;}state.userName=get('username');store('ocean-prototype-user',state.userName);go('home');toast('已进入演示工作台，未进行真实登录。');break;
  }
});
$('#file-picker').addEventListener('change',event=>{const files=[...event.target.files];if(!files.length)return;if(filePurpose==='kb'){const kb=selectedKB();if(kb){kb.files.push(...files.map(f=>({name:f.name,type:f.name.split('.').pop().toUpperCase(),chunks:12})));saveKB();render();toast('已添加本地演示条目，未读取、上传或解析文件。');}}else if(filePurpose==='image'){toast('已选择参考图「'+files[0].name+'」，原型不上传文件。');}else{state.attachments.push(...files.map(f=>({name:f.name,size:f.size})));render();toast('已添加附件演示状态，未上传文件。');}event.target.value='';});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if($('.dialog'))closeDialog();else if($('.popover'))closePopover();else if(state.sidebarOpen){state.sidebarOpen=false;document.body.classList.remove('sidebar-open');}return;}
  const dlg=$('.dialog');if(event.key==='Tab'&&dlg){const focusables=$$('button:not(:disabled),input:not(:disabled),textarea,select,a[href],[tabindex="0"]',dlg).filter(e=>e.offsetParent!==null);const first=focusables[0],last=focusables.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  if(event.target.matches('textarea[data-draft]')&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(event.target.dataset.draft==='mrag')askKB();else if(!state.busy)startTask(state.draft);}
  if(event.target.id==='resize-handle'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const pane=$('.workspace-pane'),area=$('.chat-layout');state.workspaceWidth=Math.max(310,Math.min(area.clientWidth*.7,pane.getBoundingClientRect().width+(event.key==='ArrowLeft'?20:-20)));pane.style.width=state.workspaceWidth+'px';event.target.setAttribute('aria-valuenow',state.workspaceWidth);}
});
document.addEventListener('pointerdown',event=>{if(event.target.id!=='resize-handle')return;event.preventDefault();const handle=event.target,pane=$('.workspace-pane'),area=$('.chat-layout');handle.setPointerCapture(event.pointerId);document.body.style.cursor='col-resize';handle.onpointermove=e=>{const box=area.getBoundingClientRect();state.workspaceWidth=Math.max(310,Math.min(box.width*.7,box.right-e.clientX));pane.style.width=state.workspaceWidth+'px';handle.setAttribute('aria-valuenow',Math.round(state.workspaceWidth));};const stop=()=>{handle.onpointermove=null;document.body.style.cursor='';};handle.onpointerup=stop;handle.onpointercancel=stop;});
addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(view!==state.view)go(view);});
setTheme(state.theme);setQuality(state.quality);const initial=location.hash.slice(1);state.view=initial in pageTitles?initial:'home';if(state.view==='chat')state.task={...sessions[0],query:sessions[0].title};render();
