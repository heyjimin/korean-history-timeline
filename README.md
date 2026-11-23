# 한국사 연표

한국사의 주요 사건을 **시대와 시간순**으로 보고, 사건마다 **설명**과 **일어난 장소**, **관련 인물**, 그리고 **연결된 사건**을 따라가며 살펴보는 웹사이트입니다.

**사이트:** https://heyjimin.github.io/korean-history-timeline/

예를 들어 임진왜란에서 출발해 한산도 대첩 같은 주요 전투, 정유재란, 전쟁 뒤의 조선통신사 파견까지 이어서 보고, 이순신을 눌러 그가 관련된 사건만 모아 볼 수 있습니다.

## 볼 수 있는 것

- **타임라인** — 가로는 시간, 세로는 분야(정치·제도, 전쟁·외교, 경제·사회, 문화). 축소하면 핵심 사건만, 확대하면 상세 사건까지 보입니다.
- **지도** — 타임라인에 보이는 기간의 사건이 일어난 곳. 한국어 지명, 단순·지형·위성·상세 배경 지도.
- **연결 관계** — 고른 사건의 원인과 결과, 앞뒤 사건, 하위 사건을 그래프로.
- **인물** — 인물을 고르면 그 인물의 사건을 타임라인과 지도에서 강조합니다.
- **검색** — `/` 키로 사건·인물·장소 검색 (초성 검색 가능).
- **표 보기·인물 목록** — 인쇄하기 좋은 시대별 표와 인물 카드.

> 사건·인물 데이터는 검수 중인 초안입니다. 틀린 내용을 발견하면 이슈로 알려 주세요.

## 개발

Node.js 22 이상이 필요합니다.

```bash
npm install
```

```bash
npm run dev
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 실행 (http://localhost:4321) |
| `npm run validate` | 데이터 검증 (스키마, 사건·장소·인물 참조, 날짜 순서) |
| `npm test` | 단위 테스트 |
| `npm run build` | 검증 후 정적 사이트 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |

처음 빌드할 때는 사건마다 공유 미리보기 이미지를 만드느라 몇 분 걸립니다. 이후에는 바뀐 사건만 다시 그려서 몇 초면 끝납니다.

## 데이터

사건, 인물, 장소, 시대 데이터는 [`data/`](data/) 폴더의 JSON 파일입니다. 작성 규칙과 사건 선정 기준은 [데이터 작성 가이드](docs/data-guide.md)에 있습니다.

참고 자료:
- [나무위키: 대학수학능력시험/한국사 영역/연표](https://namu.wiki/w/%EB%8C%80%ED%95%99%EC%88%98%ED%95%99%EB%8A%A5%EB%A0%A5%EC%8B%9C%ED%97%98/%ED%95%9C%EA%B5%AD%EC%82%AC%20%EC%98%81%EC%97%AD/%EC%97%B0%ED%91%9C)
- [위키백과: 한국사 연표](https://ko.wikipedia.org/wiki/%ED%95%9C%EA%B5%AD%EC%82%AC_%EC%97%B0%ED%91%9C)

## 배포

`main` 브랜치에 푸시하면 GitHub Actions가 데이터 검증, 테스트, 타입 검사, 빌드를 거쳐 GitHub Pages에 배포합니다.
저장소의 **Settings → Pages → Build and deployment → Source**가 **GitHub Actions**로 설정되어 있어야 합니다.

## 라이선스

- 코드: [MIT](LICENSE)
- 콘텐츠와 데이터: [CC BY-NC-SA 4.0](CONTENT-LICENSE.md)
- 지도: [OpenFreeMap](https://openfreemap.org) © [OpenMapTiles](https://www.openmaptiles.org/), 데이터 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 기여자 (ODbL), 지형·위성 이미지 © Esri
- 글꼴: [Pretendard](https://github.com/orioncactus/pretendard) (SIL Open Font License)
