/**
 * 행복네컷 QR 공유 서버 (Google Apps Script) - V3.73
 * ------------------------------------------------------------
 * 하는 일
 *  1) doPost : 행복네컷 프로그램이 보낸 사진을 내 구글 드라이브 "행복네컷 공유" 폴더에 저장
 *  2) doGet  : QR 코드를 찍은 휴대폰에 사진 보기/저장 페이지를 보여줌
 *  3) cleanupOldPhotos : 보관 기간(KEEP_DAYS)이 지난 사진 자동 삭제 (트리거 등록 시)
 *
 * 처음 설정 (README.txt의 "QR 공유 설정" 참고)
 *  - SHARED_KEY 를 나만 아는 값으로 바꾸기 (행복네컷 관리자 설정의 "공유 키"와 같아야 함)
 *  - 배포 > 새 배포 > 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자
 *  - setupCleanupTrigger 를 한 번 실행하면 매일 오래된 사진을 지움
 */

const SHARED_KEY  = 'change-me';      // ⚠️ 이 줄의 따옴표 안만 바꾸세요. 행복네컷 관리자 설정의 "공유 키"와 동일하게

// ✅ V3.72: "바꾸기 전 값" 비교용. 찾기·바꾸기로 키를 바꿔도 이 값은 바뀌지 않도록 나눠서 적음
const PLACEHOLDER_KEY_ = ['change', 'me'].join('-');
const FOLDER_NAME = '행복네컷 공유';    // 사진이 저장될 드라이브 폴더 이름
const KEEP_DAYS   = 7;                 // 사진 보관 기간(일). 0이면 자동 삭제 안 함
const MAX_BYTES   = 15 * 1024 * 1024;  // 업로드 최대 크기

// ---------------------------------------------------------------
// 업로드 (행복네컷 → 드라이브)
// ---------------------------------------------------------------
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (!SHARED_KEY || SHARED_KEY === PLACEHOLDER_KEY_) {
      return json_({ ok: false, error: 'SERVER_KEY_NOT_SET' });
    }
    if (body.key !== SHARED_KEY) {
      return json_({ ok: false, error: 'UNAUTHORIZED' });
    }

    const mime = (body.mimeType === 'image/png') ? 'image/png' : 'image/jpeg';
    const bytes = Utilities.base64Decode(String(body.image || ''));
    if (!bytes.length) return json_({ ok: false, error: 'EMPTY_IMAGE' });
    if (bytes.length > MAX_BYTES) return json_({ ok: false, error: 'TOO_LARGE' });

    const name = sanitizeName_(body.filename) || ('행복네컷_' + Date.now() + (mime === 'image/png' ? '.png' : '.jpg'));
    const file = getFolder_().createFile(Utilities.newBlob(bytes, mime, name));

    // "링크가 있는 모든 사용자 보기" (학교 계정 정책상 막혀 있어도 사진 페이지는 동작)
    let publicLink = true;
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {
      publicLink = false;
    }

    const id = file.getId();
    return json_({
      ok: true,
      id: id,
      pageUrl: ScriptApp.getService().getUrl() + '?id=' + encodeURIComponent(id),
      driveUrl: 'https://drive.google.com/file/d/' + id + '/view',
      publicLink: publicLink
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------
// 사진 페이지 (QR → 휴대폰) / 연결 확인
// ---------------------------------------------------------------
function doGet(e) {
  const p = (e && e.parameter) || {};

  // 행복네컷 관리자 설정의 "연결 테스트"
  if (p.ping) {
    return json_({ ok: true, app: 'happy4cut', keySet: !!SHARED_KEY && SHARED_KEY !== PLACEHOLDER_KEY_ });
  }

  if (p.id) {
    const file = findSharedFile_(p.id);
    if (!file) {
      return HtmlService.createHtmlOutput(messagePage_('사진을 찾을 수 없어요', '보관 기간이 지나 삭제되었을 수 있어요.'))
        .setTitle('행복네컷')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    const blob = file.getBlob();
    const t = pageTemplate_();   // ✅ V3.72: HTML 파일 이름이 page / Page 어느 쪽이어도 동작
    t.name = file.getName();
    t.dataUrl = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    t.downloadUrl = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(file.getId());
    t.thumbUrl = 'https://drive.google.com/thumbnail?sz=w1600&id=' + encodeURIComponent(file.getId());   // ✅ V3.73: 미리보기 예비 주소
    t.keepDays = KEEP_DAYS;
    return t.evaluate()
      .setTitle('행복네컷')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return HtmlService.createHtmlOutput(messagePage_('행복네컷 사진 공유', '공유 서버가 동작 중입니다.'))
    .setTitle('행복네컷')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------
// 오래된 사진 자동 삭제
// ---------------------------------------------------------------
function cleanupOldPhotos() {
  if (!KEEP_DAYS) return;
  const limit = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const it = getFolder_().getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getDateCreated().getTime() < limit) f.setTrashed(true);
  }
}

/** 한 번만 실행: 매일 새벽 3시에 cleanupOldPhotos 실행 */
function setupCleanupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (tr) { return tr.getHandlerFunction() === 'cleanupOldPhotos'; })
    .forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('cleanupOldPhotos').timeBased().everyDays(1).atHour(3).create();
}

/** 처음 한 번 실행하면 드라이브 권한 승인 창이 뜹니다 */
function authorize() {
  getFolder_();
  Logger.log('폴더 준비 완료: ' + FOLDER_NAME);
}

// ---------------------------------------------------------------
// 내부 함수
// ---------------------------------------------------------------
function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (err) { /* 삭제된 경우 새로 만듦 */ }
  }
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

// 공유 폴더 안의 파일만 보여줌 (드라이브의 다른 파일은 열리지 않도록)
function findSharedFile_(id) {
  try {
    const file = DriveApp.getFileById(id);
    if (file.isTrashed()) return null;
    const folderId = getFolder_().getId();
    const parents = file.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) return file;
    }
  } catch (err) { /* 없는 파일 */ }
  return null;
}

function sanitizeName_(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function messagePage_(title, msg) {
  return '<div style="font-family:sans-serif;text-align:center;padding:48px 20px;color:#374151">' +
         '<div style="font-size:22px;font-weight:700;color:#db2777;margin-bottom:10px">' + title + '</div>' +
         '<div style="font-size:15px">' + msg + '</div></div>';
}

// ✅ V3.72: HTML 파일 이름을 소문자(page)로 만들어도 동작하도록
function pageTemplate_() {
  try { return HtmlService.createTemplateFromFile('Page'); }
  catch (err) { return HtmlService.createTemplateFromFile('page'); }
}
