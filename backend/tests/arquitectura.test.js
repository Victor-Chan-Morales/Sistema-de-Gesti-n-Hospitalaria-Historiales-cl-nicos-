// Comprueba la regla de dependencias de la arquitectura hexagonal: el núcleo no conoce
// ni los drivers ni el framework. Si alguien los importa ahí, esta prueba falla.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../src');
const PAQUETES_PROHIBIDOS = ['express', 'pg', 'mysql2', 'mongodb', 'firebase-admin', 'bcrypt', 'jsonwebtoken', 'dotenv'];

// Capa => capas que puede importar.
const CAPAS = {
  domain: ['domain'],
  ports: ['ports', 'domain'],
  application: ['application', 'domain', 'ports'],
};

function archivosJs(directorio) {
  return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) return archivosJs(ruta);
    return entrada.name.endsWith('.js') ? [ruta] : [];
  });
}

function importsDe(archivo) {
  const codigo = fs.readFileSync(archivo, 'utf8');
  return [...codigo.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
}

describe('regla de dependencias', () => {
  for (const [capa, permitidas] of Object.entries(CAPAS)) {
    for (const archivo of archivosJs(path.join(RAIZ, capa))) {
      it(`${path.relative(RAIZ, archivo)} solo depende de ${permitidas.join(', ')}`, () => {
        for (const importado of importsDe(archivo)) {
          if (importado.startsWith('.')) {
            const destino = path.relative(RAIZ, path.resolve(path.dirname(archivo), importado)).split(path.sep)[0];
            assert.ok(permitidas.includes(destino), `importa la capa ${destino}`);
          } else {
            assert.ok(!PAQUETES_PROHIBIDOS.includes(importado.split('/')[0]), `importa el paquete ${importado}`);
          }
        }
      });
    }
  }

  it('solo el factory conoce los adaptadores de persistencia, además de ellos mismos', () => {
    const fuera = archivosJs(RAIZ)
      .filter((archivo) => !archivo.includes(`${path.sep}adapters${path.sep}persistence${path.sep}`))
      .filter((archivo) => importsDe(archivo).some((i) => i.includes('adapters/persistence')))
      .map((archivo) => path.relative(RAIZ, archivo));
    assert.deepEqual(fuera, [path.join('factory', 'repositoryFactory.js')]);
  });
});
