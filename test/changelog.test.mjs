import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateChangelog, inspectRepository, createChangelogServer } from '../src/index.js';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../bin/ctxlab.mjs', import.meta.url));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxlab-changelog-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const git = (...args) => execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init');git('config','user.name','Test');git('config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(root,'package.json'),'{"name":"release-fixture"}');git('add','.');git('commit','-m','feat: add initial screen');git('tag','v1.0.0');
  git('commit','--allow-empty','-m','fix(auth): resolve session expiry');
  git('commit','--allow-empty','-m','chore: update tooling');
  git('commit','--allow-empty','-m','fix(auth): resolve session expiry');
  git('commit','--allow-empty','-m','refactor!: change API contract');git('tag','v1.1.0');
  git('commit','--allow-empty','-m','feat: add export controls');
  return {root,git};
}
test('unreleased, tagged release, multi-project and filtered ranges preserve breaking changes',t=>{
  const {root}=fixture(t);
  const unreleased=generateChangelog({projects:[{path:root}]});
  assert.match(unreleased.markdown,/Export controls/);assert.equal(unreleased.stats.included,1);
  const range=generateChangelog({projects:[{path:root,mode:'range',from:'v1.0.0',to:'v1.1.0'}],title:'Release notes'});
  assert.equal(range.stats.scanned,4);assert.equal(range.stats.included,2);assert.equal(range.stats.filtered,2);
  assert.match(range.markdown,/Breaking: Refactored Change API contract/);assert.doesNotMatch(range.markdown,/tooling/);
  const releases=generateChangelog({projects:[{path:root,mode:'releases',count:2}]});
  assert.equal(releases.projects[0].versions.length,2);assert.match(releases.markdown,/### 1\.0\.0/);
  const multiple=generateChangelog({projects:[{path:root},{path:root,name:'Another project'}]});assert.equal(multiple.projects.length,2);
  const internal=generateChangelog({projects:[{path:root,mode:'range',from:'v1.0.0',to:'v1.1.0'}],includeInternal:true});assert.equal(internal.stats.included,4);
});
test('untagged repositories use complete history and same-reference ranges are empty',t=>{
  const {root,git}=fixture(t);git('tag','-d','v1.0.0','v1.1.0');
  assert.equal(generateChangelog({projects:[{path:root}]}).stats.scanned,6);
  const empty=generateChangelog({projects:[{path:root,mode:'range',from:'HEAD',to:'HEAD'}]});assert.equal(empty.stats.included,0);assert.match(empty.markdown,/No user-facing changes/);
  assert.throws(()=>generateChangelog({projects:[{path:root,mode:'releases'}]}),/no release tags/);
});
test('invalid and shell-like references fail without executing shell code',t=>{
  const {root}=fixture(t);const marker=path.join(root,'injected');
  assert.throws(()=>generateChangelog({projects:[{path:root,mode:'range',from:`HEAD; touch ${marker}`,to:'HEAD'}]}));
  assert.equal(fs.existsSync(marker),false);
  assert.throws(()=>generateChangelog({projects:[{path:root,mode:'releases',count:100}]}),/between 1 and 20/);
  assert.equal(inspectRepository(root).name,'release-fixture');
});
test('CLI exports Markdown and JSON without changing repository files',t=>{
  const {root,git}=fixture(t);const before=git('status','--porcelain');
  const markdown=execFileSync(process.execPath,[cli,'changelog','--title','CLI release'],{cwd:root,encoding:'utf8'});assert.match(markdown,/# CLI release/);
  const json=JSON.parse(execFileSync(process.execPath,[cli,'changelog','--format','json'],{cwd:root,encoding:'utf8'}));assert.equal(json.stats.included,1);assert.equal(git('status','--porcelain'),before);
  assert.throws(()=>execFileSync(process.execPath,[cli,'changelog','--from','missing','--to','HEAD'],{cwd:root,stdio:'pipe'}));
});
test('local dashboard rejects foreign origins and serves only changelog assets and APIs',async t=>{
  const {root}=fixture(t);const server=createChangelogServer({root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/Changes worth sharing/);
  const list=await (await fetch(base+'/api/repositories')).json();assert.equal(list.repositories.length,1);
  const request={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projects:[{path:root}]})};
  const generated=await fetch(base+'/api/generate',request);assert.equal(generated.status,200);assert.equal((await generated.json()).stats.included,1);
  const rejected=await fetch(base+'/api/generate',{...request,headers:{...request.headers,Origin:'https://untrusted.example'}});assert.equal(rejected.status,403);
  assert.equal((await fetch(base+'/api/chatgpt/agent/status')).status,404);
  const foreignHost = await new Promise((resolve,reject) => { const request = http.get(base+'/api/repositories',{headers:{Host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject); });
  assert.equal(foreignHost,403);
});
