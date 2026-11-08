// Puerto propio del Centro Médico Pediátrico (ports/repositoriosEspecializados.js).
//
// Los controles de crecimiento y el registro de vacunas se consultan siempre junto con el
// paciente y no son masivos por visita, así que se embeben como subcolecciones de su documento:
//   pacientes/{id}/controles_crecimiento/{id}
//   pacientes/{id}/registro_vacunas/{id}
// El catálogo de vacunas es una colección de primer nivel compartida por todos los pacientes.

const { createHash } = require('node:crypto');
const { NoEncontrado, RegistroDuplicado, DatosInvalidos } = require('../../../domain/errores');
const { calcularImc, porCampo, porCampoDesc } = require('../nosql-comun/utilidades');

const marcaDeCreacion = () => new Date().toISOString();
const sinCamposInternos = (d) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_')));

function crearPediatria(cn, h) {
  const { col, refPaciente, nuevoId, auditar, exigirPaciente, esIdValido } = h;

  const vacunaAContrato = (snap) => ({ id_vacuna: snap.id, ...snap.data() });

  async function listarSubcoleccion(idPaciente, nombre, ordenar) {
    if (!esIdValido(idPaciente)) throw new NoEncontrado('El paciente no existe.');
    const ref = refPaciente(idPaciente);
    if (!(await ref.get()).exists) throw new NoEncontrado('El paciente no existe.');
    const { docs } = await ref.collection(nombre).get();
    return docs.map((d) => d.data()).sort(ordenar).map(sinCamposInternos);
  }

  const seguimiento = {
    async listarVacunas() {
      const { docs } = await col('vacunas').where('estado', '==', 'Activa').get();
      return docs.map(vacunaAContrato).sort(porCampo('nombre'));
    },

    agregarControl: (idPaciente, datos, actor) => cn.transaccion(async (tx) => {
      const paciente = await exigirPaciente(tx, idPaciente);

      let idConsulta = null;
      if (datos.id_consulta) {
        const consulta = esIdValido(String(datos.id_consulta)) ? await tx.get(col('consultas').doc(String(datos.id_consulta))) : null;
        if (!consulta?.exists || consulta.data().id_paciente !== idPaciente) {
          throw new DatosInvalidos('id_consulta hace referencia a una consulta inexistente de este paciente.');
        }
        idConsulta = consulta.id;
      }

      const id = nuevoId();
      const control = {
        id_control_crecimiento: id,
        id_historial: paciente.data().historial.id_historial,
        id_consulta: idConsulta,
        fecha_control: datos.fecha_control,
        peso: datos.peso ?? null,
        talla: datos.talla ?? null,
        perimetro_cefalico: datos.perimetro_cefalico ?? null,
        // Registrado por el profesional o calculado a partir de peso (kg) y talla (cm).
        indice_masa_corporal: datos.indice_masa_corporal ?? calcularImc(datos.peso, datos.talla),
        observaciones: datos.observaciones ?? null,
        id_usuario: actor.id_usuario,
        _creada_en: marcaDeCreacion(),
      };
      tx.create(refPaciente(idPaciente).collection('controles_crecimiento').doc(id), control);
      auditar(tx, actor, 'CREAR', 'Control_Crecimiento', id);
      return sinCamposInternos(control);
    }),

    listarControles: (idPaciente) => listarSubcoleccion(idPaciente, 'controles_crecimiento', porCampoDesc('fecha_control', '_creada_en')),

    registrarVacuna: (idPaciente, datos, actor) => cn.transaccion(async (tx) => {
      const paciente = await exigirPaciente(tx, idPaciente);
      const vacunaSnap = esIdValido(String(datos.id_vacuna)) ? await tx.get(col('vacunas').doc(String(datos.id_vacuna))) : null;
      if (!vacunaSnap?.exists) throw new DatosInvalidos('id_vacuna hace referencia a un registro inexistente.');

      // El ID se deriva de vacuna, dosis y fecha de aplicación: un doble envío del mismo registro es un
      // duplicado, pero una dosis que puede repetirse (un refuerzo) se admite en otra fecha.
      const id = createHash('sha256')
        .update(`${vacunaSnap.id}|${datos.numero_dosis.trim().toLowerCase()}|${datos.fecha_aplicacion}`)
        .digest('hex').slice(0, 20);
      const ref = refPaciente(idPaciente).collection('registro_vacunas').doc(id);
      if ((await tx.get(ref)).exists) throw new RegistroDuplicado('Esa dosis de esa vacuna ya está registrada en esa fecha.');

      const registro = {
        id_registro_vacuna: id,
        id_historial: paciente.data().historial.id_historial,
        id_vacuna: vacunaSnap.id,
        nombre_vacuna: vacunaSnap.data().nombre,
        numero_dosis: datos.numero_dosis,
        fecha_aplicacion: datos.fecha_aplicacion,
        lote: datos.lote ?? null,
        centro_aplicacion: datos.centro_aplicacion ?? null,
        proxima_dosis: datos.proxima_dosis ?? null,
        observaciones: datos.observaciones ?? null,
        id_usuario: actor.id_usuario,
        _creada_en: marcaDeCreacion(),
      };
      tx.create(ref, registro);
      auditar(tx, actor, 'CREAR', 'Registro_Vacuna', id);
      return sinCamposInternos(registro);
    }),

    listarRegistroVacunas: (idPaciente) => listarSubcoleccion(idPaciente, 'registro_vacunas', porCampoDesc('fecha_aplicacion', '_creada_en')),
  };

  return { seguimiento };
}

module.exports = { crearPediatria };
