import { fetch } from 'undici'

async function test() {
  const response = await fetch('https://ai.starimg.ru')
  const html = await response.text()
  const matches = html.match(/"api\/[^"]+"/g)
  console.log('API endpoints found:', matches)
}

test()