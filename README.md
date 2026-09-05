# Planner

- Firebase Email/Password login + Firestore sync
- Korean natural-language calendar input
- Relative dates such as `다음주 화요일 8시 수행` and `다음주 화요일에 오후8시에 수학학원`
- Date ranges such as `9월 10일부터 9월 13일까지 오후 3시 시험기간`
- Calendar events render as horizontal bars; multi-day events connect across days
- WISH / BOUGHT wishlist with product metadata lookup and delete

## Firebase
Put your Firebase web config in `firebase-config.js`.


### v7 changes
- 아이보리 대신 화이트/쿨 웜그레이 계열로 전체 디자인을 변경했습니다.
- 위시리스트에서 링크가 없어도 사진 파일을 직접 선택해 저장할 수 있습니다.
- 업로드한 사진은 브라우저에서 크기를 줄여 Firestore에 저장합니다.


## v11
캘린더는 v8 디자인을 그대로 유지합니다. 일정 추가 버튼은 클릭 이벤트를 안정적으로 연결하고 dialog fallback을 포함합니다.
