# chiikawa-friends

Claude Code 데스크톱 앱의 입력창 위에 작은 풀밭을 띄우는 mod 입니다. 치이카와, 하치와레, 우사기, 쿠리만쥬, 모몽가, 랏코가 그 위에서 걷고, 뛰고, 졸고, 서로 만나 놉니다.

- **하늘은 컨텍스트 창을 따라갑니다.** 쓴 비율에 따라 맑음(25% 미만) → 흐림 → 소나기 → 폭풍 → 압축 임박(90% 이상)으로 바뀝니다.
- **빛은 시각을 따라갑니다.** 새벽(5시), 낮(7시), 노을(17시), 밤(19시)마다 하늘 색이 바뀌고, 밤에는 별이 뜹니다.
- **해와 달이 하늘을 가로지릅니다.** 해는 5시에 왼쪽 언덕 뒤에서 떠올라 12시에 가장 높이 오르고, 19시에 오른쪽 언덕 뒤로 집니다. 달은 19시에 떠서 0시에 가장 높이 오르고, 5시에 집니다. 해와 달은 맑은 하늘에서만 보입니다.
- **압축하면 하늘이 갭니다.** 대화를 압축하면 하늘이 맑아지고, 무지개가 떴다가 저절로 사라집니다.
- **하치와레가 한마디 합니다.** Claude 가 작업하는 동안 하치와레가 지금 하는 일을 보고 짧게 한마디 합니다. 턴이 끝나면 말풍선도 사라집니다.

## 설치

터미널에서 연 Claude Code 세션의 입력창에:

```
/plugin install chiikawa-friends --marketplace stlim1025/chiikawa-friends
```

`Add marketplace?` 가 나오면 `y` 를 누르고, 설치 범위(scope)를 고릅니다. 맨 위의 user 범위를 Enter 로 고르면 이후 모든 세션에서 켜집니다.

셸에서:

```bash
claude plugin install chiikawa-friends --marketplace stlim1025/chiikawa-friends
```

데스크톱 앱에서는 `/plugin` 이 동작하지 않습니다. 입력창 옆 **+** → **Plugins** → **Add marketplace** 에 `stlim1025/chiikawa-friends` 를 넣은 뒤 **Add plugin** 을 누릅니다.

## 업데이트

새 버전이 올라와도 이미 설치한 PC 에는 저절로 들어가지 않습니다. 이 저장소 같은 제3자 마켓플레이스는 자동 업데이트가 기본으로 꺼져 있기 때문입니다.

셸에서 마켓플레이스 목록을 새로 받은 뒤 mod 를 올립니다:

```bash
claude plugin marketplace update chiikawa-friends
claude plugin update chiikawa-friends@chiikawa-friends
```

그다음 데스크톱 앱을 다시 시작하면 새 버전이 보입니다.

앞으로 자동으로 받으려면, 터미널에서 연 세션에서 `/plugin` → **Marketplaces** 탭 → `chiikawa-friends` → **Enable auto-update** 를 고릅니다. 그 뒤로는 세션이 시작될 때 새 버전을 받아 두고, 다음 세션부터 적용됩니다.

## 알아 둘 점

- 풀밭은 **데스크톱 앱에서만** 그려집니다. 터미널에는 그림(Svg)을 그릴 수 없어서 아무것도 보이지 않습니다.
- 하치와레의 한마디는 작업 중에 작은 모델(haiku)을 최소 8초 간격으로 불러 만듭니다. 이 호출도 사용량에 포함됩니다.

## 알림

치이카와 캐릭터의 권리는 원작자 나가노와 권리자에게 있습니다. 이 mod 는 비공식 팬 작품입니다. 캐릭터 그림은 직접 만든 게임의 3D 모델을 캡처한 WebP 프레임입니다(`hooks/sprites.mjs`).
