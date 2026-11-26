import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReadingPage } from '../src/reading/render.js';
import { PROJECTS } from '../src/data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../src/data/journey.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const siteUrl=(process.env.SITE_URL||'').replace(/\/$/,'');

const redirect=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nour Chkair — Redirecting</title>
<meta name="robots" content="noindex">
<script>
(function(){
  var hash=location.hash||'#/home';
  var query=location.search||'';
  location.replace('index.html'+query+hash);
})();
</script>
</head>
<body>
<p>Redirecting to <a href="index.html">Nour OS</a>…</p>
</body>
</html>
`;

const notFound=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found — Nour Chkair</title>
<meta name="robots" content="noindex">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="src/styles/reading.css">
</head>
<body class="reading-page">
<main class="reading-main" style="padding-top:14vh">
<span class="reading-kicker">Nour OS / 404</span>
<h1 style="margin:14px 0 18px;font-size:clamp(42px,7vw,76px);line-height:.95;letter-spacing:-.06em">This page is off the map.</h1>
<p class="reading-lead">The link may be outdated, or the page may have moved.</p>
<p><a class="reading-cta" href="index.html#/home">Back to Nour OS</a> <a class="reading-link" href="read.html">Read the portfolio</a></p>
</main>
</body>
</html>
`;

const favicon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0a1014"/>
  <rect x="1" y="1" width="62" height="62" rx="13" fill="none" stroke="#ffd2a1" stroke-opacity=".65"/>
  <path d="M18 46V18h5.8L45 39.4V18h5v28h-5.4L23 24.2V46Z" fill="#ffd2a1"/>
</svg>
`;

const robots=`User-agent: *
Allow: /
Disallow: /archive/
${siteUrl?`Sitemap: ${siteUrl}/sitemap.xml\n`:''}`;

function write(file,body){fs.writeFileSync(path.join(root,file),body);}
write('read.html',renderReadingPage());
write('spatial2.html',redirect);
write('favicon.svg',favicon);
write('robots.txt',robots);
write('404.html',notFound);
if(siteUrl){
  write('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc></url>
  <url><loc>${siteUrl}/read.html</loc></url>
</urlset>
`);
}
// Static deployment allowlist. Archive, docs and tests never enter dist.
const dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist,{recursive:true});
const files=['index.html','read.html','spatial2.html','404.html','favicon.svg','robots.txt'];
if(fs.existsSync(path.join(root,'sitemap.xml'))) files.push('sitemap.xml');
for(const file of files) fs.copyFileSync(path.join(root,file),path.join(dist,file));
for(const dir of ['assets','src']){
  fs.cpSync(path.join(root,dir),path.join(dist,dir),{recursive:true,filter:src=>{
    const rel=path.relative(root,src).replaceAll(path.sep,'/');
    return !rel.startsWith('archive/')&&!rel.includes('/tests/');
  }});
}
// Reading-only modules are build-time only; keep them out of the runtime deployment.
fs.rmSync(path.join(dist,'src/reading'),{recursive:true,force:true});
for(const buildOnly of ['src/data/site.js','src/utils/html.js']) fs.rmSync(path.join(dist,buildOnly),{force:true});
fs.rmSync(path.join(dist,'src/utils'),{recursive:true,force:true});
fs.writeFileSync(path.join(dist,'.nojekyll'),'');
console.log(JSON.stringify({built:true,projects:PROJECTS.length,chapters:PROFESSIONAL_CHAPTERS.length,dist:true},null,2));
