// Registra el resolver de alias antes de cargar los módulos de test.
// Uso: node --import ./test/register-alias.mjs --test test/
import { register } from 'node:module'
register('./alias-resolver.mjs', import.meta.url)
