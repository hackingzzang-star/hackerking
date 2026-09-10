// ============================================================
// src/core/stores.js
// localStorage에 저장되는 "편집 오버레이" 데이터를 다루는 공용 클래스입니다.
//
// 이 앱의 데이터 모델은 두 레이어로 되어 있습니다:
//   ① 하드코딩 기본값 — INTERVIEW_SCRIPTS, AI_FLOW_DEFAULTS (src/data/*.js)
//   ② 사용자 편집 레이어 — scriptOverrides, flowOverrides (이 파일이 다루는 것, localStorage 저장)
// 화면에 보여줄 때는 "②가 있으면 ②, 없으면 ①"로 병합해서 씁니다.
//
// [설계 메모] 왜 여기서 안 쓰고 굳이 `.data`를 외부에 그대로 노출하는가:
// app.js 여러 곳(및 인터뷰 가이드가 여는 팝업창의 window.opener 참조)에서 지금도
// `scriptOverrides[code] = ...`, `delete flowOverrides[code]`처럼 이 객체를 직접 mutate합니다.
// 이런 참조를 전부 `scriptStore.set(...)` 형태로 바꾸는 건 팝업 간 통신까지 건드리는 큰 리팩터링이라
// 지금 단계에서는 하지 않습니다. 대신 `store.data`가 지금의 plain object와 "완전히 같은 참조"가 되게
// 해서, 기존 코드는 손대지 않고 그대로 동작하면서 새로 쓰는 코드는 store.get/set/merge 같은 명확한
// API를 쓸 수 있게 했습니다. (기존 100여 곳을 건드리지 않는 안전한 캡슐화)
// ============================================================

export class OverrideStore {
  /**
   * @param {string} storageKey - localStorage 키
   * @param {string} errorLabel - 저장 실패 시 alert에 표시할 이름 (예: '인터뷰 질문 편집')
   */
  constructor(storageKey, errorLabel) {
    this.storageKey = storageKey;
    this.errorLabel = errorLabel;
    // 기존 plain object 자리를 그대로 대신하는 실제 데이터 저장소.
    // 외부에서 `scriptOverrides = scriptStore.data`로 참조를 공유합니다.
    this.data = this._readFromStorage();
  }

  _readFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
    } catch (e) {
      return {};
    }
  }

  /** localStorage에서 다시 읽어와 반환만 함 (기존 loadXxxOverrides()와 동일한 동작) */
  load() {
    return this._readFromStorage();
  }

  /** 현재 this.data를 localStorage에 저장 (기존 saveXxxOverrides()와 동일한 동작) */
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch (e) {
      alert(this.errorLabel + ' 저장 실패: ' + e.message);
    }
  }

  /** 항목 코드 하나의 편집값 조회 */
  get(code) {
    return this.data[code];
  }

  /** 항목 코드 하나의 편집값을 완전히 교체 후 저장 */
  set(code, value) {
    this.data[code] = value;
    this.save();
  }

  /** 항목 코드 하나의 편집값에 부분 필드만 병합 후 저장 */
  merge(code, partialValue) {
    this.data[code] = Object.assign({}, this.data[code] || {}, partialValue);
    this.save();
  }

  /** 항목 코드 하나의 편집값을 삭제(기본값으로 되돌리기) 후 저장 */
  remove(code) {
    delete this.data[code];
    this.save();
  }

  /** 전체 편집 내역 삭제 후 저장 */
  clear() {
    Object.keys(this.data).forEach((k) => delete this.data[k]);
    this.save();
  }

  /** 백업 파일 복원 등에서 전체를 통째로 교체할 때 사용 */
  replaceAll(obj) {
    this.clear();
    Object.assign(this.data, obj || {});
    this.save();
  }

  /** 전체 편집 내역을 그대로 반환 (백업 파일 생성 등에 사용) */
  getAll() {
    return this.data;
  }
}
