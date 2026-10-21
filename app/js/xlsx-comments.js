// Comentários (notas) do Excel: comments.xml + desenho VML "legacy", que o Excel exige.
// Se a folha já tiver comentários, acrescenta-os aos existentes.

const REL_COMMENTS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';
const REL_VML = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const AUTHOR = 'Casuística';
const SHAPETYPE = '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>';

const attr = (tag, name) => { const m = new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const colLetter = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

function resolve(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
}
function relative(fromDir, to) {
  const a = fromDir.split('/'), b = to.split('/');
  while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
  return '../'.repeat(a.length) + b.join('/');
}
function uniqueName(zip, prefix, ext) { let i = 1; while (zip.file(`${prefix}${i}.${ext}`)) i++; return `${prefix}${i}.${ext}`; }

/**
 * @param comments [{row (1-based), col (0-based), text}]
 * @returns o XML da folha atualizado (com <legacyDrawing>)
 */
export async function addComments(zip, sheetPath, sheetXml, comments) {
  const dir = sheetPath.split('/').slice(0, -1).join('/');
  const relsPath = `${dir}/_rels/${sheetPath.split('/').pop()}.rels`;
  let rels = zip.file(relsPath) ? await zip.file(relsPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  if (/<Relationships\b[^>]*\/>/.test(rels)) rels = rels.replace(/<Relationships\b([^>]*)\/>/, '<Relationships$1></Relationships>');
  const relTags = () => [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]);
  const nextRid = () => { let i = 1; while (relTags().some((t) => attr(t, 'Id') === `rId${i}`)) i++; return `rId${i}`; };
  let ct = await zip.file('[Content_Types].xml').async('string');

  // comments.xml
  const cRel = relTags().find((t) => attr(t, 'Type') === REL_COMMENTS);
  let cPath, cXml;
  if (cRel) {
    cPath = resolve(sheetPath, attr(cRel, 'Target'));
    cXml = await zip.file(cPath).async('string');
  } else {
    cPath = uniqueName(zip, 'xl/comments', 'xml');
    cXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors></authors><commentList></commentList></comments>';
    rels = rels.replace('</Relationships>', `<Relationship Id="${nextRid()}" Type="${REL_COMMENTS}" Target="${relative(dir, cPath)}"/></Relationships>`);
    ct = ct.replace('</Types>', `<Override PartName="/${cPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>`);
  }
  cXml = cXml.replace(/<authors\s*\/>/, '<authors></authors>').replace(/<commentList\s*\/>/, '<commentList></commentList>');
  const authorsBlock = (/<authors>([\s\S]*?)<\/authors>/.exec(cXml) || ['', ''])[1];
  const authors = [...authorsBlock.matchAll(/<author>([\s\S]*?)<\/author>/g)].map((m) => unesc(m[1]));
  let authorId = authors.indexOf(AUTHOR);
  if (authorId < 0) { authorId = authors.length; cXml = cXml.replace('</authors>', `<author>${AUTHOR}</author></authors>`); }
  const refs = comments.map((c) => colLetter(c.col) + c.row);
  for (const ref of refs) cXml = cXml.replace(new RegExp(`<comment\\b[^>]*\\bref="${ref}"[\\s\\S]*?<\\/comment>`), '');
  cXml = cXml.replace('</commentList>', comments.map((c, i) =>
    `<comment ref="${refs[i]}" authorId="${authorId}"><text><r><t xml:space="preserve">${esc(c.text)}</t></r></text></comment>`).join('') + '</commentList>');
  zip.file(cPath, cXml);

  // desenho VML
  const vRel = relTags().find((t) => attr(t, 'Type') === REL_VML);
  let vPath, vXml, vRid;
  if (vRel) {
    vPath = resolve(sheetPath, attr(vRel, 'Target'));
    vXml = await zip.file(vPath).async('string');
    vRid = attr(vRel, 'Id');
  } else {
    vPath = uniqueName(zip, 'xl/drawings/vmlDrawing', 'vml');
    vRid = nextRid();
    vXml = '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      '<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>' + SHAPETYPE + '</xml>';
    rels = rels.replace('</Relationships>', `<Relationship Id="${vRid}" Type="${REL_VML}" Target="${relative(dir, vPath)}"/></Relationships>`);
    if (!/Extension="vml"/i.test(ct)) ct = ct.replace('</Types>', '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/></Types>');
  }
  if (!/_x0000_t202/.test(vXml)) vXml = vXml.replace(/<\/xml>\s*$/, SHAPETYPE + '</xml>');
  let sid = Math.max(1024, ...[...vXml.matchAll(/_x0000_s(\d+)/g)].map((m) => Number(m[1])));
  const shapes = comments.map((c) => {
    sid++;
    const r0 = c.row - 1;
    return `<v:shape id="_x0000_s${sid}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:2pt;width:160pt;height:60pt;z-index:${sid};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">` +
      '<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>' +
      `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${c.col + 1}, 15, ${Math.max(0, r0 - 1)}, 10, ${c.col + 4}, 15, ${r0 + 3}, 4</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${r0}</x:Row><x:Column>${c.col}</x:Column></x:ClientData></v:shape>`;
  }).join('');
  vXml = vXml.replace(/<\/xml>\s*$/, shapes + '</xml>');
  zip.file(vPath, vXml);
  zip.file(relsPath, rels);
  zip.file('[Content_Types].xml', ct);

  // <legacyDrawing> na folha, na posição que o esquema do Excel exige
  if (!/<legacyDrawing\b/.test(sheetXml)) {
    if (!/xmlns:r=/.test(/<worksheet\b[^>]*>/.exec(sheetXml)[0])) sheetXml = sheetXml.replace(/<worksheet\b/, `<worksheet xmlns:r="${NS_R}"`);
    const tag = `<legacyDrawing r:id="${vRid}"/>`;
    const after = /<(legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(sheetXml);
    sheetXml = after ? sheetXml.slice(0, after.index) + tag + sheetXml.slice(after.index) : sheetXml.replace('</worksheet>', tag + '</worksheet>');
  }
  return sheetXml;
}
