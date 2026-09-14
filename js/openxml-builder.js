/**
 * SAVY PDF Workspace — OpenXML Document Builder (js/openxml-builder.js)
 * Generates genuine, standards-compliant Microsoft Office OpenXML (.docx, .xlsx, .pptx)
 * ZIP packages purely in browser memory without external APIs or server dependencies.
 *
 * Conforms to ECMA-376 / ISO/IEC 29500 standard OpenXML schemas:
 * - WordprocessingML (.docx)
 * - SpreadsheetML (.xlsx)
 * - PresentationML (.pptx)
 *
 * Privacy Guarantee: 100% Client-Side. Zero data leaves your device.
 */

import { createZipArchive } from './pdf-toolbox.js';
import {
  APP_XML,
  CORE_XML,
  PRESPROPS_XML,
  VIEWPROPS_XML,
  TABLESTYLES_XML,
  THEME1_XML,
  SLIDEMASTER1_XML,
  SLIDEMASTER1_RELS,
  SLIDELAYOUTS,
} from './openxml-pptx-templates.js';

function escapeXml(str) {
  if (typeof str !== 'string') str = String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// 1. WORDPROCESSINGML (.docx) GENERATOR
// ============================================================================

/**
 * Builds a valid Microsoft Word (.docx) OpenXML document package.
 * @param {Array<{ text: string, heading?: number, bold?: boolean, italic?: boolean, isPageBreak?: boolean }>} paragraphs
 * @param {Object} [options]
 * @param {Uint8Array} [options.imageBuffer] Optional embedded image
 * @param {string} [options.imageFormat] 'png' or 'jpeg'
 * @returns {Blob} Valid .docx ZIP Blob
 */
export function buildDocx(paragraphs, options = {}) {
  if (!Array.isArray(paragraphs) && paragraphs && typeof paragraphs === 'object') {
    options = paragraphs;
    paragraphs = paragraphs.paragraphs || [];
  }
  if (!Array.isArray(paragraphs)) paragraphs = [];

  const { imageBuffer, imageFormat = 'png' } = options;
  const hasImage = Boolean(imageBuffer && imageBuffer.length > 0);
  const imageExt = imageFormat === 'jpeg' ? 'jpg' : 'png';
  const imageContentType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

  // [Content_Types].xml
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasImage ? `<Default Extension="${imageExt}" ContentType="${imageContentType}"/>` : ''}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  // _rels/.rels
  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // word/_rels/document.xml.rels
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${hasImage ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.${imageExt}"/>` : ''}
</Relationships>`;

  // word/styles.xml
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="222222"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="160" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="36"/>
      <w:color w:val="1E293B"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="200" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="28"/>
      <w:color w:val="334155"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  // word/document.xml body paragraphs
  let bodyXml = '';

  // If embedded image is present (e.g. Image -> Word), embed DrawingML inline block at top
  if (hasImage) {
    const emuW = 5029200; // ~5.5in
    const emuH = 3657600; // ~4in
    bodyXml += `
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <wp:extent cx="${emuW}" cy="${emuH}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="1" name="Picture 1"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="0" name="image1.${imageExt}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;
  }

  for (const p of paragraphs) {
    if (p.isPageBreak) {
      bodyXml += `
    <w:p>
      <w:r>
        <w:br w:type="page"/>
      </w:r>
    </w:p>`;
      continue;
    }

    const headingStyle = p.heading === 1 ? 'Heading1' : p.heading === 2 ? 'Heading2' : null;
    const pPr = headingStyle ? `<w:pPr><w:pStyle w:val="${headingStyle}"/></w:pPr>` : '';

    let rPr = '<w:rPr>';
    if (p.bold) rPr += '<w:b/>';
    if (p.italic) rPr += '<w:i/>';
    rPr += '</w:rPr>';

    const lines = (p.text || '').split('\n');
    let rContent = '';
    lines.forEach((line, idx) => {
      if (idx > 0) rContent += '<w:br/>';
      rContent += `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
    });

    bodyXml += `
    <w:p>
      ${pPr}
      <w:r>
        ${rPr}
        ${rContent}
      </w:r>
    </w:p>`;
  }

  if (!bodyXml.trim()) {
    bodyXml = '<w:p><w:r><w:t>Document Content</w:t></w:r></w:p>';
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const encoder = new TextEncoder();
  const files = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(packageRels) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(documentRels) },
    { name: 'word/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
  ];

  if (hasImage) {
    files.push({
      name: `word/media/image1.${imageExt}`,
      data: imageBuffer instanceof Uint8Array ? imageBuffer : new Uint8Array(imageBuffer),
    });
  }

  return createZipArchive(files);
}

// ============================================================================
// 2. SPREADSHEETML (.xlsx) GENERATOR
// ============================================================================

/**
 * Builds a valid Microsoft Excel (.xlsx) OpenXML spreadsheet package.
 * @param {Array<Array<string|number>>} rows 2D array of table data
 * @param {Object} [options]
 * @param {string} [options.sheetName='Sheet1']
 * @returns {Blob} Valid .xlsx ZIP Blob
 */
export function buildXlsx(rows, options = {}) {
  const sheetName = escapeXml(options.sheetName || 'Sheet1');

  const stringMap = new Map();
  const stringList = [];

  function getSharedStringIndex(str) {
    str = String(str ?? '');
    if (!stringMap.has(str)) {
      stringMap.set(str, stringList.length);
      stringList.push(str);
    }
    return stringMap.get(str);
  }

  function getColLetter(colIdx) {
    let letter = '';
    let temp = colIdx;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  }

  let sheetDataXml = '';
  rows.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 1;
    let rowXml = `<row r="${rowNum}">`;
    row.forEach((cellVal, colIdx) => {
      const cellRef = `${getColLetter(colIdx)}${rowNum}`;
      if (typeof cellVal === 'number' && !isNaN(cellVal)) {
        rowXml += `<c r="${cellRef}"><v>${cellVal}</v></c>`;
      } else {
        const sIdx = getSharedStringIndex(cellVal);
        rowXml += `<c r="${cellRef}" t="s"><v>${sIdx}</v></c>`;
      }
    });
    rowXml += '</row>';
    sheetDataXml += rowXml;
  });

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${sheetName}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  let sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${stringList.length}" uniqueCount="${stringList.length}">`;
  for (const s of stringList) {
    sharedStringsXml += `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`;
  }
  sharedStringsXml += '</sst>';

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetDataXml}
  </sheetData>
</worksheet>`;

  const encoder = new TextEncoder();
  return createZipArchive([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(packageRels) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/sharedStrings.xml', data: encoder.encode(sharedStringsXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml) },
  ]);
}

// ============================================================================
// 3. PRESENTATIONML (.pptx) GENERATOR
// ============================================================================

/**
 * Builds a valid Microsoft PowerPoint (.pptx) OpenXML presentation package.
 * @param {Array<{ title: string, content: string|string[] }>} slides
 * @returns {Blob} Valid .pptx ZIP Blob
 */
export function buildPptx(slidesOrPages, options = {}) {
  const encoder = new TextEncoder();
  const files = [];

  // Handle object options vs array
  if (!Array.isArray(slidesOrPages) && slidesOrPages && typeof slidesOrPages === 'object') {
    options = slidesOrPages;
    slidesOrPages = slidesOrPages.slides || slidesOrPages.pages || [];
  }
  if (!Array.isArray(slidesOrPages) || slidesOrPages.length === 0) {
    slidesOrPages = [{ title: 'Presentation Title', content: 'Converted from SAVY PDF Workspace' }];
  }

  // Determine slide dimensions (EMU: 1 pt = 12700 EMU)
  // Default to 16:9 widescreen (12192000 x 6858000 EMU) or page dimensions
  const first = slidesOrPages[0] || {};
  let slideWidthEmu = 12192000;
  let slideHeightEmu = 6858000;
  if (first.widthPt && first.heightPt) {
    slideWidthEmu = Math.round(first.widthPt * 12700);
    slideHeightEmu = Math.round(first.heightPt * 12700);
  }

  // 1. [Content_Types].xml
  let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`;

  for (let l = 1; l <= 11; l++) {
    contentTypes += `\n  <Override PartName="/ppt/slideLayouts/slideLayout${l}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`;
  }

  slidesOrPages.forEach((_, idx) => {
    contentTypes += `\n  <Override PartName="/ppt/slides/slide${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  });
  contentTypes += '\n</Types>';
  files.push({ name: '[Content_Types].xml', data: encoder.encode(contentTypes) });

  // 2. Package relationships: _rels/.rels
  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  files.push({ name: '_rels/.rels', data: encoder.encode(packageRels) });

  // 3. Static Document & Presentation Properties
  files.push({ name: 'docProps/app.xml', data: encoder.encode(APP_XML) });
  files.push({ name: 'docProps/core.xml', data: encoder.encode(CORE_XML) });
  files.push({ name: 'ppt/presProps.xml', data: encoder.encode(PRESPROPS_XML) });
  files.push({ name: 'ppt/viewProps.xml', data: encoder.encode(VIEWPROPS_XML) });
  files.push({ name: 'ppt/tableStyles.xml', data: encoder.encode(TABLESTYLES_XML) });
  files.push({ name: 'ppt/theme/theme1.xml', data: encoder.encode(THEME1_XML) });

  // 4. Slide Master and all Slide Layouts
  files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: encoder.encode(SLIDEMASTER1_XML) });
  files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: encoder.encode(SLIDEMASTER1_RELS) });

  for (let l = 1; l <= 11; l++) {
    const layoutKey = `slideLayout${l}.xml`;
    const layoutRelsKey = `_rels/slideLayout${l}.xml.rels`;
    if (SLIDELAYOUTS[layoutKey]) {
      files.push({ name: `ppt/slideLayouts/${layoutKey}`, data: encoder.encode(SLIDELAYOUTS[layoutKey]) });
    }
    if (SLIDELAYOUTS[layoutRelsKey]) {
      files.push({ name: `ppt/slideLayouts/${layoutRelsKey}`, data: encoder.encode(SLIDELAYOUTS[layoutRelsKey]) });
    }
  }

  // 5. ppt/presentation.xml
  let sldIdLst = '<p:sldIdLst>';
  slidesOrPages.forEach((_, idx) => {
    sldIdLst += `\n    <p:sldId id="${256 + idx}" r:id="rId${idx + 7}"/>`;
  });
  sldIdLst += '\n  </p:sldIdLst>';

  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  ${sldIdLst}
  <p:sldSz cx="${slideWidthEmu}" cy="${slideHeightEmu}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
  files.push({ name: 'ppt/presentation.xml', data: encoder.encode(presentationXml) });

  // 6. ppt/_rels/presentation.xml.rels
  let presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>`;

  slidesOrPages.forEach((_, idx) => {
    presRels += `\n  <Relationship Id="rId${idx + 7}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx + 1}.xml"/>`;
  });
  presRels += '\n</Relationships>';
  files.push({ name: 'ppt/_rels/presentation.xml.rels', data: encoder.encode(presRels) });

  // 7. Individual Slides
  slidesOrPages.forEach((item, idx) => {
    const slideNum = idx + 1;
    let slideXml = '';
    let slideRels = '';

    if (item.imageBuffer && item.imageBuffer.length > 0) {
      // High-Fidelity Image Slide (Preserves 100% of PDF layout, fonts, diagrams, tables)
      const format = item.format === 'jpeg' ? 'jpeg' : (item.format === 'jpg' ? 'jpeg' : 'png');
      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const mediaName = `image${slideNum}.${ext}`;

      files.push({
        name: `ppt/media/${mediaName}`,
        data: item.imageBuffer instanceof Uint8Array ? item.imageBuffer : new Uint8Array(item.imageBuffer),
      });

      const wEmu = item.widthPt ? Math.round(item.widthPt * 12700) : slideWidthEmu;
      const hEmu = item.heightPt ? Math.round(item.heightPt * 12700) : slideHeightEmu;

      slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="Slide Image ${slideNum}"/>
          <p:cNvPicPr><a:picLocks/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId2"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="${wEmu}" cy="${hEmu}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;

      slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout7.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>
</Relationships>`;
    } else {
      // Structured Text Slide
      const titleText = escapeXml(item.title || `Slide ${slideNum}`);
      const contentLines = Array.isArray(item.content)
        ? item.content
        : String(item.content || '').split('\n').filter(Boolean);

      let bodyParasXml = '';
      contentLines.forEach((line) => {
        bodyParasXml += `
          <a:p>
            <a:pPr lvl="0"/>
            <a:r>
              <a:rPr lang="en-US" sz="2000"/>
              <a:t>${escapeXml(line)}</a:t>
            </a:r>
          </a:p>`;
      });

      if (!bodyParasXml.trim()) {
        bodyParasXml = '<a:p><a:r><a:rPr lang="en-US" sz="2000"/><a:t>Content</a:t></a:r></a:p>';
      }

      slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="838200" y="457200"/><a:ext cx="10515600" cy="1143000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="3600" b="1"/>
              <a:t>${titleText}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content 2"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="838200" y="1828800"/><a:ext cx="10515600" cy="4572000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/>
          <a:lstStyle/>
          ${bodyParasXml}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;

      slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
    }

    files.push({ name: `ppt/slides/slide${slideNum}.xml`, data: encoder.encode(slideXml) });
    files.push({ name: `ppt/slides/_rels/slide${slideNum}.xml.rels`, data: encoder.encode(slideRels) });
  });

  return createZipArchive(files);
}
