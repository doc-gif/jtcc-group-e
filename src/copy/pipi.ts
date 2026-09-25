/**
 * 案内役「ピピ」（オリジナル）のセリフをここに集める。
 * 実在キャラクターにはしゃべらせない。キャラクター名を含めないことをテストで確認する。
 */
export const pipiLines = {
  welcome: 'はじめまして！ ピピだよ♡ いっしょに最後の一点をさがそう',
  roomStart: 'いっしょに回そ♡ ハンドルを くるくるしてね',
  soloStart: 'ハンドルを くるくるしてね♡',
  again: 'もう1回 いこっ♡',
  turn1Featured: 'あれ…リボンの色がちがう…？',
  turn1: 'いい感じ〜！ その調子♡',
  turn2Featured: 'きたきたきた〜！ 目玉が来るよ！',
  turn2Sparkle: 'これは チャンスかも♡',
  turn2: 'お花が咲いてきた…！',
  turn3Featured: 'せーのっ！ ぜったい来るよ！',
  turn3: 'せーのっ！',
  openFeatured: '光ってる…！ 3回タップして開けてね',
  open: '開けてみて♡',
  revealFeatured: 'すごーい！！ おめでとうございます！',
  revealSparkle: 'キラキラの 出たね♡ かわいい〜！',
  reveal: 'やったね♡ かわいい〜',
  friendFeatured: (name: string) => `すごーい！ ${name}ちゃん おめでとうございます！`,
  pair: (name: string) => `${name}ちゃんと おそろいだ♡`,
} as const
