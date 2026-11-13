import { expect, test } from 'claude-code/testing'

import { DAYTIMES, WEATHERS, bubbleLine, buildScene, daytimeFor, isLeavingTime, weatherFor } from './hooks/chiikawa-friends.mjs'

const BAND = {
  plugin: 'chiikawa-friends',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// Nothing draws beneath the plugin: this hook stands for the engine's band.
const engineBand = (on, now = () => 0) => {
  on('clock.now', () => ({ value: now() }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: 'engine' })
  })
}

// Stands for the engine's session: what it reads, and a timer that never fires
// unless the test holds its period.
const engineSession = (on, usage, period = () => new Promise(() => {})) => {
  on('session.usage', () => ({
    value: { startedAt: 0, rateLimits: [], context: { window: 1000, percent: usage() } },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  on('clock.every', period)
}

const SESSION = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const TURN = { answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
const MESSAGES = [{ role: 'user', text: 'summary', toolUses: [] }]

// Whatever the machine's zone, this hour on its own clock.
const atHour = hour => new Date(2026, 10, 6, hour).getTime()

test('the desktop draws the meadow and keeps what is beneath it', async ($, on) => {
  engineBand(on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })

  // The desktop's interactive frame scrubs <image>, which would drop every character.
  expect(svg?.props.isInteractive).not.toBe(true)
  for (const name of ['치이카와', '하치와레', '우사기', '쿠리만쥬', '모몽가', '랏코']) {
    expect(String(svg?.props.source)).toContain(name)
  }
  expect(String(svg?.props.source)).not.toContain('시사')
  expect(String(svg?.props.source)).toContain('data:image/webp')
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('the terminal has no Svg, so the band passes', async ($, on) => {
  engineBand(on)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('a survey keeps the band', async ($, on) => {
  engineBand(on)

  const ui = await $.ui.mount({
    ...BAND,
    surface: 'desktop',
    props: { ...BAND.props, hasSurvey: true },
  })

  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('every plan stays under the Svg limit with animations a browser will run', { timeoutMs: 60000 }, () => {
  for (const seed of [1, 2, 3, 42, 99, 1234, 777777, 20261106]) {
    for (const width of [360, 520, 800, 1200, 1600]) {
      for (const weather of WEATHERS) {
        for (const daytime of DAYTIMES) {
          const thought = seed % 2 ? '가나다라마바사아자차카타파하가나다…' : undefined
          const source = buildScene(seed, width, { weather, daytime, startAt: 123.4, rainbowAge: 5, thought })

          expect(source.length).toBeLessThan(131072)

          for (const [tag] of source.matchAll(/<animate(?:Transform)?\b[^>]*>/g)) {
            const keyTimes = /keyTimes="([^"]+)"/.exec(tag)?.[1].split(';').map(Number)
            const values = /values="([^"]+)"/.exec(tag)?.[1].split(';')

            if (!keyTimes) {
              continue
            }

            expect(keyTimes.length).toBe(values?.length)
            expect(keyTimes[0]).toBe(0)
            expect(keyTimes.every((time, i) => i === 0 || time >= keyTimes[i - 1])).toBe(true)
            expect(keyTimes[keyTimes.length - 1]).toBeLessThan(1.0001)
            if (!tag.includes('discrete')) {
              expect(keyTimes[keyTimes.length - 1]).toBe(1)
            }
          }
        }
      }
    }
  }
})

test('each of the six stands once, drawn again wherever a pose has no frame of its own', () => {
  const source = buildScene(42, 800)

  expect(source.match(/id="stand-/g)?.length).toBe(6)
  expect((source.match(/<use href="#stand-/g)?.length ?? 0) >= 6).toBe(true)
  expect((source.match(/data:image.webp/g)?.length ?? 99) <= 43).toBe(true)
})

test('on the narrowest field no one walks off it', () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    const source = buildScene(seed, 360)
    const walks = [...source.matchAll(/<animateTransform attributeName="transform" type="translate" keyTimes="[^"]+" values="([^"]+)"/g)]

    expect(walks.length).toBe(6)
    for (const [, values] of walks) {
      expect(values.split(';').every(x => Number(x) >= 0 && Number(x) <= 360)).toBe(true)
    }
  }
})

// What everyone does and when: every on-off track that runs the whole loop.
const timelineOf = source =>
  [...source.matchAll(/calcMode="discrete" keyTimes="[^"]+" values="[^"]+" dur="240s"/g)].map(([track]) => track).join('|')

test('a field that widens or narrows keeps the same play, each in the same part of it', () => {
  const widths = [520, 800, 1200]
  const scenes = widths.map(width => buildScene(42, width))

  expect(timelineOf(scenes[1]).length > 1000).toBe(true)
  expect(timelineOf(scenes[0])).toBe(timelineOf(scenes[1]))
  expect(timelineOf(scenes[2])).toBe(timelineOf(scenes[1]))

  // Everyone sets out from home, the same share of the way across.
  scenes.forEach((source, i) => {
    const homes = [...source.matchAll(/type="translate" keyTimes="[^"]+" values="([^";]+)/g)].map(([, x]) => Number(x) / widths[i])

    expect(homes.map(share => share.toFixed(2)).join(' ')).toBe('0.14 0.28 0.42 0.56 0.70 0.84')
  })
})

test('the sky follows the bands of the context window', () => {
  const wordAt = percent => weatherFor(percent).word

  expect(wordAt(0)).toBe('맑음')
  expect(wordAt(24)).toBe('맑음')
  expect(wordAt(25)).toBe('흐림')
  expect(wordAt(49)).toBe('흐림')
  expect(wordAt(50)).toBe('소나기')
  expect(wordAt(74)).toBe('소나기')
  expect(wordAt(75)).toBe('폭풍')
  expect(wordAt(89)).toBe('폭풍')
  expect(wordAt(90)).toBe('압축 임박')
  expect(wordAt(100)).toBe('압축 임박')
})

test('the part of the day follows the local hour', () => {
  const wordAt = hour => daytimeFor(hour).word

  expect(wordAt(0)).toBe('밤')
  expect(wordAt(4)).toBe('밤')
  expect(wordAt(5)).toBe('새벽')
  expect(wordAt(6)).toBe('새벽')
  expect(wordAt(7)).toBe('낮')
  expect(wordAt(16)).toBe('낮')
  expect(wordAt(17)).toBe('노을')
  expect(wordAt(18)).toBe('노을')
  expect(wordAt(19)).toBe('밤')
  expect(wordAt(23)).toBe('밤')
})

// The sun or the moon on its way across: where it stands as drawn, the whole
// path it moves along by itself, and how far along that path it already is.
const crossingOf = (source, id) => {
  const found = new RegExp(
    `<g id="${id}" transform="translate\\(([^)]+)\\)"><animateTransform attributeName="transform" type="translate" values="([^"]+)" dur="(\\d+)s" begin="-(\\d+)s" fill="freeze"/>`,
  ).exec(source)

  return found && { at: found[1], path: found[2].split(';'), dur: Number(found[3]), since: Number(found[4]) }
}
const at = (hour, minute = 0) => ({ daytime: daytimeFor(hour), secondOfDay: hour * 3600 + minute * 60 })

test('the sun rises on the left at five, stands highest at noon and sets on the right at seven', () => {
  const dawn = crossingOf(buildScene(42, 800, at(5)), 'sun')
  const noon = crossingOf(buildScene(42, 800, at(12)), 'sun')
  const dusk = crossingOf(buildScene(42, 800, at(18, 59)), 'sun')

  expect(dawn?.dur).toBe(14 * 3600)
  expect(dawn?.since).toBe(0)
  expect(dawn?.at).toBe('30 116')
  expect(noon?.since).toBe(7 * 3600)
  expect(noon?.at).toBe('400 26')
  expect(dusk?.since).toBe(14 * 3600 - 60)
  // Below the hill at either end: it comes up from behind it and goes down behind it.
  expect(noon?.path[0]).toBe('30 116')
  expect(noon?.path[noon.path.length - 1]).toBe('770 116')
  expect(buildScene(42, 800, at(12))).not.toContain('id="moon"')
})

test('the moon crosses the night sky, on past midnight', () => {
  const evening = crossingOf(buildScene(42, 800, at(19)), 'moon')
  const midnight = crossingOf(buildScene(42, 800, at(0)), 'moon')
  const late = crossingOf(buildScene(42, 800, at(2)), 'moon')

  expect(evening?.dur).toBe(10 * 3600)
  expect(evening?.since).toBe(0)
  expect(midnight?.since).toBe(5 * 3600)
  expect(midnight?.at).toBe('400 26')
  expect(late?.since).toBe(7 * 3600)
  expect(buildScene(42, 800, at(0))).not.toContain('id="sun"')
})

test('on the narrowest field the sun keeps to the sky, and a cloudy one hides it', () => {
  for (const hour of [5, 9, 12, 15, 18]) {
    const sun = crossingOf(buildScene(42, 360, at(hour)), 'sun')

    expect(sun.path.length > 10).toBe(true)
    for (const point of [...sun.path, sun.at]) {
      const [x, y] = point.split(' ').map(Number)

      expect(x >= 0 && x <= 360 && y >= 0 && y <= 116).toBe(true)
    }
  }
  expect(buildScene(42, 800, { ...at(12), weather: WEATHERS[1] })).not.toContain('id="sun"')
})

test('a new sky changes nothing but the sky', () => {
  const playOf = source => source.slice(source.indexOf('<g transform="translate(0 104)">'))
  const scenes = WEATHERS.flatMap(weather =>
    DAYTIMES.flatMap(daytime => [
      buildScene(42, 800, { weather, daytime }),
      buildScene(42, 800, { weather, daytime, rainbowAge: 5 }),
    ]),
  )

  expect(new Set(scenes).size).toBe(WEATHERS.length * DAYTIMES.length * 2)
  expect(new Set(scenes.map(playOf)).size).toBe(1)
})

test('a reply becomes one short line', () => {
  expect(bubbleLine('  "설정 파일부터\n볼까!"  ')).toBe('설정 파일부터 볼까!')
  expect(bubbleLine('「어떻게든 되겠지!」')).toBe('어떻게든 되겠지!')
  // Its own name in front is the model announcing the speaker, not the line.
  expect(bubbleLine('하치와레: "해냈다~!"')).toBe('해냈다~!')
})

test('a reply that explains itself gives only the line it ends on, and only one that could be spoken', () => {
  const explained =
    '기다리는 중이다 → 조금만 더~ 풍으로, 작업 내용을 짚는 짧은 대사.\n\n(Note: the request is the work content.)\n\n조금만 더 기다리면 돼~'

  expect(bubbleLine(explained)).toBe('조금만 더 기다리면 돼~')
  // An arrow, a file name or a number is not something Hachiware says.
  expect(bubbleLine('기다리는 중이다 → 조금만 더~')).toBe('')
  expect(bubbleLine('config 읽는 중!')).toBe('')
  expect(bubbleLine('테스트 25개 통과!')).toBe('')
})

test('a reply too long for the bubble keeps the sentences that fit, never a cut one', () => {
  expect(bubbleLine('어디 보자~ 설정 파일부터 차근차근 하나씩 읽어 볼까나')).toBe('어디 보자~')
  expect(bubbleLine('해냈다! 통과야! 이제 남은 건 설치본에 반영하는 일뿐이네')).toBe('해냈다! 통과야!')
  // No sentence of it fits: nothing is said, rather than half a sentence.
  expect(bubbleLine('가나다라마바사아자차카타파하가나다라마바사')).toBe('')
  expect(bubbleLine('하치와레 목소리로 조용히 기록을 확인하는 중이야!')).toBe('')
})

test('Hachiware says the thought in place of its own lines, and no one else changes', () => {
  const groupOf = (source, name) => {
    const start = source.indexOf(`<title>${name}</title>`)
    const end = source.indexOf('<g transform="translate(0 104)">', start)

    return source.slice(start, end === -1 ? undefined : end)
  }
  const plain = buildScene(42, 800)
  const saying = buildScene(42, 800, { thought: '설정 <&> 볼까' })
  const hachiware = groupOf(saying, '하치와레')

  expect(hachiware).toContain('설정 &lt;&amp;&gt; 볼까')
  expect(hachiware.match(/<rect /g)?.length).toBe(1)
  for (const name of ['치이카와', '우사기', '쿠리만쥬']) {
    expect(groupOf(saying, name)).toBe(groupOf(plain, name))
  }
})

test('near the edge of the field the thought slides inward', () => {
  const source = buildScene(42, 360, { thought: '가나다라마바사아자차카타파하가나다…' })
  const hachiware = source.slice(source.indexOf('<title>하치와레</title>'))
  const slide = /<g><animateTransform attributeName="transform" type="translate" keyTimes="[^"]+" values="([^"]+)"/.exec(hachiware)

  expect(slide?.[1].split(';').some(value => Number(value.split(' ')[0]) !== 0)).toBe(true)
})

// November 2026: the 13th is a Friday, the 14th and 15th the weekend, the 16th a Monday.
const leavingAt = (day, hour, minute) => isLeavingTime(new Date(2026, 10, day, hour, minute))

test('weekdays from 17:50 until six are the time to get ready to leave', () => {
  expect(leavingAt(13, 17, 49)).toBe(false)
  expect(leavingAt(13, 17, 50)).toBe(true)
  expect(leavingAt(13, 17, 59)).toBe(true)
  expect(leavingAt(13, 18, 0)).toBe(false)
  expect(leavingAt(14, 17, 55)).toBe(false)
  expect(leavingAt(15, 17, 55)).toBe(false)
  expect(leavingAt(16, 17, 55)).toBe(true)
})

// One character's part of the image, from its name to the next character's.
const castGroup = (source, name) => {
  const start = source.indexOf(`<title>${name}</title>`)
  const end = source.indexOf('<g transform="translate(0 104)">', start)

  return source.slice(start, end === -1 ? undefined : end)
}
const LEAVING_LINES = { 하치와레: '퇴근 준비하자~!', 쿠리만쥬: '퇴근하고 한잔~', 모몽가: '퇴근해!', 랏코: '오늘 수련은 끝이다' }

test('at leaving time four of them take turns telling you to get ready, and the other two play on', () => {
  const plain = buildScene(42, 800)
  const leaving = buildScene(42, 800, { isLeaving: true })
  const turns = Object.entries(LEAVING_LINES).map(([name, line]) => {
    const group = castGroup(leaving, name)
    const turn = /<animate attributeName="opacity" calcMode="discrete" values="([^"]+)" keyTimes="([^"]+)" dur="20s"/.exec(group)

    expect(group).toContain(`>${line}</text>`)
    // Its own lines rest meanwhile: the one bubble is the reminder. (A bubble's
    // words are placed by y alone; the z, hearts and sparkles also take an x.)
    expect(group.match(/<text y=/g)?.length).toBe(1)
    expect(turn?.[1].split(';').length).toBe(turn?.[2].split(';').length)
    expect(turn?.[2].split(';')[0]).toBe('0')

    return turn?.[2]
  })

  expect(new Set(turns).size).toBe(4)
  for (const name of ['치이카와', '우사기']) {
    expect(castGroup(leaving, name)).toBe(castGroup(plain, name))
  }
  expect(plain).not.toContain('퇴근')
})

test('a reminder near the edge of the field slides inward rather than going unsaid', () => {
  const rakko = castGroup(buildScene(42, 360, { isLeaving: true }), '랏코')

  expect(rakko).toContain('>오늘 수련은 끝이다</text>')
})

test('while Claude works Hachiware keeps to the work, and the others still remind', () => {
  const source = buildScene(42, 800, { isLeaving: true, thought: '설정 볼까' })

  expect(castGroup(source, '하치와레')).toContain('설정 볼까')
  expect(castGroup(source, '하치와레')).not.toContain('퇴근')
  expect(castGroup(source, '모몽가')).toContain('>퇴근해!</text>')
})

test('a new sky picks the play up where it was', () => {
  const source = buildScene(42, 800, { weather: WEATHERS[3], startAt: 30 })
  const walk = /<animateTransform attributeName="transform" type="translate" keyTimes[^>]*>/.exec(source)?.[0]

  expect(walk).toContain('begin="-30.0s"')
})

test('past one loop the play wraps and the clouds drift on', () => {
  const source = buildScene(42, 800, { startAt: 300 })
  const walk = /<animateTransform attributeName="transform" type="translate" keyTimes[^>]*>/.exec(source)?.[0]

  expect(walk).toContain('begin="-60.0s"')
  expect(source).toContain('dur="170s" begin="-340.0s"')
})

test('a main turn that moves the window redraws the sky; a subagent turn does not', async ($, on) => {
  let percent: number | undefined = 10

  engineBand(on)
  engineSession(on, () => percent)

  await $.session.start(SESSION)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const alt = async () => String((await ui.find({ type: 'Svg' }))?.props.alt)

  expect(await alt()).toContain('맑음')

  percent = 80
  await $.turn.complete(TURN)
  expect(await alt()).toContain('폭풍')

  percent = 30
  await $.turn.complete({ ...TURN, agentId: 'agent' })
  expect(await alt()).toContain('폭풍')

  // Just compacted: no reading of the live window yet, so the sky clears.
  percent = undefined
  await $.turn.complete(TURN)
  expect(await alt()).toContain('맑음')
  await ui.unmount()
})

// The desktop starts an image over whenever it draws the band again, so an image
// handed out twice would replay from the moment it was first made.
test('the meadow is never drawn from an old moment: a later draw starts where the play has got to', async ($, on) => {
  let now = atHour(12)

  engineBand(on, () => now)
  engineSession(on, () => 10)

  await $.session.start(SESSION)

  const walkOf = async ui =>
    /<animateTransform attributeName="transform" type="translate" keyTimes[^>]*>/.exec(
      String((await ui.find({ type: 'Svg' }))?.props.source),
    )?.[0]
  const first = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await walkOf(first)).not.toContain('begin="-30.0s"')
  await first.unmount()

  // Thirty seconds on the sky is the same, and the band is drawn again.
  now += 30000
  const second = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await walkOf(second)).toContain('begin="-30.0s"')

  const sourceOf = async ui => String((await ui.find({ type: 'Svg' }))?.props.source)
  const drawn = await sourceOf(second)

  await second.unmount()

  // Asked again within the same moment, it is the one image: a second one would
  // be a second load on screen for nothing.
  now += 100
  const third = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await sourceOf(third)).toBe(drawn)
  await third.unmount()
})

test('the day turns to night while the app stays open', async ($, on) => {
  let now = atHour(12)
  let fireTimer = () => {}

  engineBand(on, () => now)
  engineSession(
    on,
    () => 10,
    () => new Promise(resolve => (fireTimer = () => resolve({ value: undefined }))),
  )

  await $.session.start(SESSION)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const alt = async () => String((await ui.find({ type: 'Svg' }))?.props.alt)

  expect(await alt()).toContain('낮')

  now = atHour(21)
  fireTimer()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(await alt()).toContain('밤')
  await ui.unmount()
})

test('the sun is drawn where the hour of the draw has brought it', async ($, on) => {
  engineBand(on, () => atHour(15))
  engineSession(on, () => 10)

  await $.session.start(SESSION)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const sun = crossingOf(String((await ui.find({ type: 'Svg' }))?.props.source), 'sun')

  expect(sun?.since).toBe(10 * 3600)
  await ui.unmount()
})

test('the reminders start at 17:50 on a weekday and stop at six', async ($, on) => {
  let now = new Date(2026, 10, 13, 17, 45).getTime()
  let fireTimer = () => {}

  engineBand(on, () => now)
  engineSession(
    on,
    () => 10,
    () => new Promise(resolve => (fireTimer = () => resolve({ value: undefined }))),
  )

  await $.session.start(SESSION)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = async () => (await ui.find({ type: 'Svg' }))?.props
  const tick = async at => {
    now = at
    fireTimer()
    await new Promise(resolve => setTimeout(resolve, 20))
  }

  expect(String((await svg())?.source)).not.toContain('퇴근')

  await tick(new Date(2026, 10, 13, 17, 50).getTime())
  expect(String((await svg())?.source)).toContain('>퇴근해!</text>')
  expect(String((await svg())?.alt)).toContain('퇴근')

  await tick(new Date(2026, 10, 13, 18, 0).getTime())
  expect(String((await svg())?.source)).not.toContain('퇴근')
  await ui.unmount()
})

test('a compaction clears the sky with a rainbow that fades and stays gone', async ($, on) => {
  let now = atHour(12)
  let percent = 92

  engineBand(on, () => now)
  engineSession(on, () => percent)
  on('session.compact', () => ({ messages: MESSAGES }))

  await $.session.start(SESSION)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = async () => (await ui.find({ type: 'Svg' }))?.props
  const hasRainbow = async () => String((await svg())?.source).includes('fill="freeze"')

  expect(String((await svg())?.alt)).toContain('압축 임박')
  expect(await hasRainbow()).toBe(false)

  await $.session.compact({ trigger: 'manual', messages: MESSAGES })
  expect(String((await svg())?.alt)).toContain('맑음')
  expect(await hasRainbow()).toBe(true)

  // A new sky while it is still up: the rainbow carries on from where it was.
  now += 10000
  percent = 30
  await $.turn.complete(TURN)
  expect(String((await svg())?.alt)).toContain('흐림')
  expect(String((await svg())?.source)).toContain('begin="-10.0s" fill="freeze"')

  // A new sky once it has faded: it does not come back.
  now += 60000
  percent = 60
  await $.turn.complete(TURN)
  expect(String((await svg())?.alt)).toContain('소나기')
  expect(await hasRainbow()).toBe(false)
  await ui.unmount()
})

test('a compaction that replaced nothing in this conversation draws no rainbow', async ($, on) => {
  engineBand(on, () => atHour(12))
  engineSession(on, () => 60)
  on('session.compact', (_, e) => (e.trigger === 'manual' ? { skip: 'blocked' } : { messages: MESSAGES }))

  await $.session.start(SESSION)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = async () => (await ui.find({ type: 'Svg' }))?.props

  await $.session.compact({ trigger: 'manual', messages: MESSAGES })
  await $.session.compact({ trigger: 'precompute', messages: MESSAGES })
  await $.session.compact({ trigger: 'auto', agentId: 'agent', messages: MESSAGES })

  expect(String((await svg())?.alt)).toContain('소나기')
  expect(String((await svg())?.source)).not.toContain('fill="freeze"')
  await ui.unmount()
})

const STEP = { turnId: 't', index: 0, model: 'm', messageCount: 1 } as const
const ANSWER = { turnId: 't', index: 0, answer: '다 봤어', toolUses: [], stopReason: 'end_turn', usage: null } as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const SAID = { isAnswered: true, text: '"설정부터 볼까!"', usage: USAGE }
const THINKING = { kind: 'thinking', index: 0, text: 'I should read the config file first.' }
const WRITING = { kind: 'text', index: 1, text: '설정 파일을 읽어 보겠습니다.' }

// Stands for the engine while a turn runs: its response in `chunks`, the model
// that words the line, and the speaking timer, whose period `tick` ends.
const engineTurn = (on, chunks, reply, now = () => 0) => {
  const prompts: string[] = []
  let endPeriod = () => {}

  engineBand(on, now)
  engineSession(
    on,
    () => 10,
    (_, e) => (e.ms === 2000 ? new Promise(resolve => (endPeriod = () => resolve({ value: undefined }))) : new Promise(() => {})),
  )
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    yield* chunks

    return { ...ANSWER, index: e.index }
  })
  on('model.complete', (_, e) => {
    prompts.push(e.prompt)

    return { value: reply }
  })

  return {
    prompts,
    tick: async () => {
      endPeriod()
      await new Promise(resolve => setTimeout(resolve, 20))
    },
  }
}

// Reads a response to its end: its chunks, and what the stream returned.
const drain = async stream => {
  const chunks = []

  for (;;) {
    const step = await stream.next()

    if (step.done) {
      return { chunks, result: step.value }
    }
    chunks.push(`${step.value.kind}:${step.value.text}`)
  }
}

test('Hachiware says what the main loop is thinking, until the turn ends', async ($, on) => {
  let now = 0
  const turn = engineTurn(on, [THINKING, WRITING], SAID, () => now)

  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const source = async () => String((await ui.find({ type: 'Svg' }))?.props.source)

  // The response goes up as the engine streamed it.
  const heard = await drain($.turn.step(STEP))
  expect(heard.chunks.join('|')).toBe(`thinking:${THINKING.text}|text:${WRITING.text}`)
  expect(JSON.stringify(heard.result)).toBe(JSON.stringify(ANSWER))

  await turn.tick()
  expect(turn.prompts.length).toBe(1)
  expect(turn.prompts[0]).toContain('read the config file')
  expect(await source()).toContain('설정부터 볼까!')

  // Nothing new was heard, so the next period asks for no line.
  await turn.tick()
  expect(turn.prompts.length).toBe(1)

  // Something new too soon after the last line waits its eight seconds out.
  await drain($.turn.step({ ...STEP, index: 1 }))
  now = 5000
  await turn.tick()
  expect(turn.prompts.length).toBe(1)
  now = 9000
  await turn.tick()
  expect(turn.prompts.length).toBe(2)

  await $.turn.complete(TURN)
  expect(await source()).not.toContain('설정부터 볼까!')
  await ui.unmount()
})

test('a chunk with nothing in it is not news, so the same thought is not worded twice', async ($, on) => {
  let now = 0
  const chunks = [THINKING]
  const turn = engineTurn(on, chunks, SAID, () => now)

  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't' })
  await drain($.turn.step(STEP))
  await turn.tick()
  expect(turn.prompts.length).toBe(1)

  // The stream goes on with chunks that carry no words, as it does around tool calls.
  chunks.splice(0, 1, { kind: 'thinking', index: 0, text: '' }, { kind: 'text', index: 1, text: '\n' })
  await drain($.turn.step({ ...STEP, index: 1 }))
  now = 9000
  await turn.tick()
  expect(turn.prompts.length).toBe(1)
})

test('with no thinking to hear, Hachiware goes by what is written', async ($, on) => {
  const turn = engineTurn(on, [WRITING], SAID)

  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't' })
  await drain($.turn.step(STEP))
  await turn.tick()

  expect(turn.prompts[0]).toContain('설정 파일을 읽어')
})

test('what a subagent thinks is not said', async ($, on) => {
  const turn = engineTurn(on, [THINKING], SAID)

  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't' })

  const heard = await drain($.turn.step({ ...STEP, agentId: 'agent' }))
  expect(heard.chunks.join('|')).toBe(`thinking:${THINKING.text}`)

  await turn.tick()
  expect(turn.prompts.length).toBe(0)
})

test('a model that gives no line leaves the meadow as it was', async ($, on) => {
  const turn = engineTurn(on, [THINKING], { isAnswered: false, reason: 'empty-reply', usage: USAGE })

  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const source = async () => String((await ui.find({ type: 'Svg' }))?.props.source)
  const before = await source()

  await drain($.turn.step(STEP))
  await turn.tick()

  expect(turn.prompts.length).toBe(1)
  expect(await source()).toBe(before)
  await ui.unmount()
})
