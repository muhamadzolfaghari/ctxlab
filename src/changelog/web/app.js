const $ = id => document.getElementById(id);
let repositories = [], directory = null, output = '', revision = 0, browsing = 0;
async function api(url, body) {
  const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed.');
  return data;
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function setExport(enabled) { $('copy').disabled = $('download').disabled = !enabled; }
function markChanged() {
  revision++;
  $('statRepos').textContent = repositories.filter(repo => repo.selected).length;
  $('repoCount').textContent = repositories.length;
  $('generate').disabled = !repositories.some(repo => repo.selected);
  if (output) { $('previewState').textContent = 'NEEDS REFRESH'; $('previewState').classList.remove('ready'); setExport(false); status('Configuration changed. Generate again to refresh the document.'); }
}
function field(label, control) { const wrapper = element('div'); const caption = element('label', label); caption.htmlFor = control.id; wrapper.append(caption, control); return wrapper; }
function selectControl(id, choices, value) { const control = element('select'); control.id = id; for (const choice of choices) { const option = element('option', choice.label || choice.value); option.value = choice.value; control.append(option); } control.value = value; return control; }
function renderRepositories() {
  const container = $('repositories'); container.replaceChildren();
  if (!repositories.length) container.append(element('p', 'Add a Git repository to begin.', 'empty-repositories'));
  repositories.forEach((repo, index) => {
    const card = element('div', undefined, 'repo-card');
    const heading = element('div', undefined, 'repo-heading');
    const selected = element('input'); selected.type = 'checkbox'; selected.checked = repo.selected; selected.setAttribute('aria-label', `Include ${repo.name}`);
    selected.addEventListener('change', () => { repo.selected = selected.checked; markChanged(); });
    const remove = element('button', '✕', 'text-button'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${repo.name}`);
    remove.addEventListener('click', () => { repositories.splice(index,1); renderRepositories(); markChanged(); });
    heading.append(selected, element('strong', repo.name), remove); card.append(heading, element('div', `⑂ ${repo.branch} · ${repo.tags.length} release tags`, 'repo-branch'));
    const mode = selectControl(`mode-${index}`, [{value:'unreleased',label:'Unreleased · latest tag → HEAD'}, {value:'releases',label:'Latest tagged releases'}, {value:'range',label:'Custom reference range'}], repo.mode);
    mode.addEventListener('change', () => { repo.mode = mode.value; renderRepositories(); markChanged(); }); card.append(field('Release scope', mode));
    if (repo.mode === 'range') {
      const refs = [...new Set(['HEAD', ...repo.tags, ...repo.branches])].map(value => ({value}));
      const from = selectControl(`from-${index}`, refs, repo.from || repo.tags[0] || 'HEAD');
      const to = selectControl(`to-${index}`, refs, repo.to || 'HEAD'); repo.from = from.value; repo.to = to.value;
      from.addEventListener('change', () => {repo.from = from.value; markChanged();}); to.addEventListener('change', () => {repo.to = to.value; markChanged();});
      const range = element('div', undefined, 'ref-fields'); range.append(field('From (excluded)', from), field('To (included)', to)); card.append(range);
    }
    if (repo.mode === 'releases') {
      const count = element('input'); count.id = `count-${index}`; count.type='number'; count.min='1'; count.max='20'; count.value=repo.count || 1;
      count.addEventListener('input', () => {repo.count = Number(count.value); markChanged();}); card.append(field('Number of releases', count));
    }
    container.append(card);
  });
}
function renderMarkdown(text) {
  const fragment = document.createDocumentFragment(); let list = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) { if (!list) {list=element('ul'); fragment.append(list);} list.append(element('li',line.slice(2))); continue; }
    list=null;
    const heading = line.match(/^(#{1,3}) (.+)$/);
    if (heading) fragment.append(element(`h${heading[1].length}`,heading[2]));
    else if (line.trim() === '---') fragment.append(element('hr'));
    else if (line.trim()) fragment.append(element('p',line));
  }
  $('renderedPreview').replaceChildren(fragment);
}
function setView(source) {
  $('previewTab').setAttribute('aria-selected',String(!source)); $('sourceTab').setAttribute('aria-selected',String(source));
  $('previewTab').tabIndex=source?-1:0; $('sourceTab').tabIndex=source?0:-1;
  $('renderedPreview').hidden=source; $('markdownPanel').hidden=!source;
  if (!source && output) renderMarkdown($('markdownEditor').value);
}
$('previewTab').addEventListener('click',()=>setView(false)); $('sourceTab').addEventListener('click',()=>setView(true));
for (const id of ['previewTab','sourceTab']) $(id).addEventListener('keydown',event=> {if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {event.preventDefault(); const source=event.key==='End'||event.key==='ArrowRight';setView(source);$(source?'sourceTab':'previewTab').focus();}});
$('markdownEditor').addEventListener('input',()=>{output=$('markdownEditor').value; setExport(Boolean(output.trim())); $('previewState').textContent='EDITED'; $('documentMeta').textContent=`${output.length.toLocaleString()} characters · Edited draft`;});
$('title').addEventListener('input',markChanged); $('calendar').addEventListener('change',markChanged); $('includeInternal').addEventListener('change',markChanged);
$('releaseForm').addEventListener('submit',async event=>{
  event.preventDefault(); const currentRevision=revision; $('generate').disabled=true; $('generate').textContent='Generating…'; status('Reading selected Git history…');
  try {
    const data=await api('/api/generate',{title:$('title').value.trim(),calendar:$('calendar').value,includeInternal:$('includeInternal').checked,projects:repositories.filter(repo=>repo.selected).map(({path,name,mode,from,to,count})=>({path,name,mode,from,to,count}))});
    if (currentRevision!==revision) {status('Configuration changed while generating. Generate again.');return;}
    output=data.markdown; $('markdownEditor').value=output; renderMarkdown(output); setView(false); setExport(true);
    for (const [id,key] of [['statRepos','repositories'],['statScanned','scanned'],['statIncluded','included'],['statFiltered','filtered']]) $(id).textContent=data.stats[key].toLocaleString();
    $('previewState').textContent='READY TO EXPORT'; $('previewState').classList.add('ready'); $('documentMeta').textContent=`${data.projects.length} repositories · ${output.length.toLocaleString()} characters`;
    status('Changelog generated. Review or edit the Markdown before exporting.');
  } catch(error){status(error.message,true);}
  finally {$('generate').disabled=!repositories.some(repo=>repo.selected); $('generate').textContent='Generate changelog →';}
});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('markdownEditor').value);status('Changelog copied.');}catch{setView(true);$('markdownEditor').focus();$('markdownEditor').select();status('Clipboard unavailable. Copy the selected Markdown manually.');}});
$('download').addEventListener('click',()=>{const blob=new Blob([$('markdownEditor').value],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=element('a');anchor.href=url;anchor.download='CHANGELOG.md';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Changelog exported as CHANGELOG.md.');});
$('newDraft').addEventListener('click',()=>{revision++;output='';$('title').value='';$('markdownEditor').value='';setExport(false);setView(false);$('renderedPreview').replaceChildren(element('p','Configure your release, then generate a new changelog.'));$('previewState').textContent='DRAFT';$('previewState').classList.remove('ready');$('documentMeta').textContent='No document generated';for(const id of ['statScanned','statIncluded','statFiltered'])$(id).textContent='—';status('New draft started.');$('title').focus();});
async function browse(path) {
  const request=++browsing; $('directoryError').textContent=''; $('chooseDirectory').disabled=true;
  try {
    const data=await api('/api/directories'+(path?'?path='+encodeURIComponent(path):''));if(request!==browsing)return;
    directory=data;$('location').value=data.path;$('folders').replaceChildren();
    if(!data.folders.length)$('folders').append(element('li','No visible subdirectories.'));
    for(const folder of data.folders){const item=element('li');const button=element('button',folder.name);button.addEventListener('click',()=>browse(folder.path));item.append(button);$('folders').append(item);}
    $('chooseDirectory').disabled=false;$('parentDirectory').disabled=data.parent===data.path;
  }catch(error){if(request===browsing)$('directoryError').textContent=error.message;}
}
$('addRepository').addEventListener('click',()=>{$('directoryDialog').showModal();browse(directory?.path);});
$('closeDirectory').addEventListener('click',()=>$('directoryDialog').close());
$('locationForm').addEventListener('submit',event=>{event.preventDefault();browse($('location').value);});
$('parentDirectory').addEventListener('click',()=>browse(directory.parent));$('homeDirectory').addEventListener('click',()=>browse(directory.home));
$('chooseDirectory').addEventListener('click',async()=>{
  if(!directory)return; $('chooseDirectory').disabled=true;
  try{const repo=await api('/api/repositories',{path:directory.path});if(!repositories.some(existing=>existing.path===repo.path))repositories.push({...repo,selected:true,mode:'unreleased'});renderRepositories();markChanged();$('directoryDialog').close();status(`Added ${repo.name}.`);}
  catch(error){$('directoryError').textContent=error.message;}finally{$('chooseDirectory').disabled=false;}
});
api('/api/repositories').then(data=>{repositories=data.repositories.map(repo=>({...repo,selected:true,mode:'unreleased'}));renderRepositories();markChanged();}).catch(error=>status(error.message,true));
