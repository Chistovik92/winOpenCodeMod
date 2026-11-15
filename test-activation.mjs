// Test script for AI Star activation
import { activateAccessCode, validateAccessCode } from './src/aistar.ts'

const accessCode = '0H2ZZA7V1TEXDSKIS2IH'

console.log('Testing access code:', accessCode)
console.log('Valid format:', validateAccessCode(accessCode))

try {
  const result = await activateAccessCode(accessCode)
  console.log('Activation result:', result)
} catch (error) {
  console.error('Activation error:', error.message)
}