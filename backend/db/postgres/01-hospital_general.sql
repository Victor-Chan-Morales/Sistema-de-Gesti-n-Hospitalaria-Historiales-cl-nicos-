-- ENTIDADES GENERALES (NORMALIZADAS)

CREATE TABLE Institucion (
    id_institucion SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo_institucion VARCHAR(50) CHECK (tipo_institucion IN ('Hospital General', 'Clínica Odontológica', 'Laboratorio', 'Pediátrico')),
    direccion VARCHAR(200),
    estado VARCHAR(20) CHECK (estado IN ('Activa', 'Inactiva'))
);

CREATE TABLE Telefono_Institucion (
    id_telefono_inst SERIAL PRIMARY KEY,
    id_institucion INTEGER REFERENCES Institucion(id_institucion),
    numero VARCHAR(20) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('Planta', 'Celular', 'Emergencia'))
);

CREATE TABLE Correo_Institucion (
    id_correo_inst SERIAL PRIMARY KEY,
    id_institucion INTEGER REFERENCES Institucion(id_institucion),
    correo VARCHAR(100) NOT NULL
);

CREATE TABLE Usuario (
    id_usuario SERIAL PRIMARY KEY,
    id_institucion INTEGER REFERENCES Institucion(id_institucion),
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(50) CHECK (rol IN ('Administrador', 'Médico', 'Odontólogo', 'Secretaria', 'Laboratorista')),
    estado VARCHAR(20) CHECK (estado IN ('Activo', 'Inactivo')),
    fecha_creacion DATE,
    ultimo_acceso TIMESTAMP
);

CREATE TABLE Telefono_Usuario (
    id_telefono_usu SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES Usuario(id_usuario),
    numero VARCHAR(20) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('Celular', 'Casa', 'Oficina'))
);

CREATE TABLE Correo_Usuario (
    id_correo_usu SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES Usuario(id_usuario),
    correo VARCHAR(100) NOT NULL
);

CREATE TABLE Paciente (
    id_paciente SERIAL PRIMARY KEY,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    dpi_o_documento VARCHAR(50) UNIQUE,
    fecha_nacimiento DATE NOT NULL,
    sexo VARCHAR(2) CHECK (sexo IN ('M', 'F', 'O')),
    direccion VARCHAR(200),
    estado_civil VARCHAR(50),
    ocupacion VARCHAR(100),
    tipo_sangre VARCHAR(5) CHECK (tipo_sangre IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    fecha_registro DATE,
    estado VARCHAR(20) CHECK (estado IN ('Activo', 'Archivado', 'Inactivo')),
    motivo_baja VARCHAR(255)
);

CREATE TABLE Telefono_Paciente (
    id_telefono_pac SERIAL PRIMARY KEY,
    id_paciente INTEGER REFERENCES Paciente(id_paciente),
    numero VARCHAR(20) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('Celular', 'Casa', 'Trabajo'))
);

CREATE TABLE Correo_Paciente (
    id_correo_pac SERIAL PRIMARY KEY,
    id_paciente INTEGER REFERENCES Paciente(id_paciente),
    correo VARCHAR(100) NOT NULL
);

CREATE TABLE Contacto_Emergencia (
    id_contacto SERIAL PRIMARY KEY,
    id_paciente INTEGER REFERENCES Paciente(id_paciente),
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    parentesco VARCHAR(50),
    direccion VARCHAR(200)
);

CREATE TABLE Telefono_Contacto (
    id_telefono_cont SERIAL PRIMARY KEY,
    id_contacto INTEGER REFERENCES Contacto_Emergencia(id_contacto),
    numero VARCHAR(20) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('Celular', 'Casa'))
);

CREATE TABLE Representante_Encargado (
    id_representante SERIAL PRIMARY KEY,
    id_paciente INTEGER REFERENCES Paciente(id_paciente),
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    dpi VARCHAR(50),
    parentesco VARCHAR(50),
    direccion VARCHAR(200)
);

CREATE TABLE Telefono_Representante (
    id_telefono_rep SERIAL PRIMARY KEY,
    id_representante INTEGER REFERENCES Representante_Encargado(id_representante),
    numero VARCHAR(20) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('Celular', 'Casa'))
);

CREATE TABLE Correo_Representante (
    id_correo_rep SERIAL PRIMARY KEY,
    id_representante INTEGER REFERENCES Representante_Encargado(id_representante),
    correo VARCHAR(100) NOT NULL
);

CREATE TABLE Historial_Clinico (
    id_historial SERIAL PRIMARY KEY,
    id_paciente INTEGER REFERENCES Paciente(id_paciente),
    id_institucion INTEGER REFERENCES Institucion(id_institucion),
    codigo_historial VARCHAR(50) UNIQUE,
    fecha_apertura DATE NOT NULL,
    estado VARCHAR(20) CHECK (estado IN ('Activo', 'Archivado')),
    fecha_cierre DATE,
    motivo_cierre VARCHAR(255),
    observaciones TEXT
);

CREATE TABLE Antecedente_Medico (
    id_antecedente SERIAL PRIMARY KEY,
    id_historial INTEGER REFERENCES Historial_Clinico(id_historial),
    tipo_antecedente VARCHAR(50) CHECK (tipo_antecedente IN ('Personal', 'Familiar', 'Quirúrgico', 'Patológico', 'Hereditario')),
    descripcion TEXT NOT NULL,
    fecha_registro DATE NOT NULL,
    estado VARCHAR(20),
    observaciones TEXT
);

CREATE TABLE Catalogo_Alergia (
    id_catalogo_alergia SERIAL PRIMARY KEY,
    sustancia VARCHAR(100) NOT NULL,
    tipo_alergia VARCHAR(50) CHECK (tipo_alergia IN ('Medicamentosa', 'Alimentaria', 'Ambiental', 'Otra'))
);

CREATE TABLE Historial_Alergia (
    id_historial INTEGER REFERENCES Historial_Clinico(id_historial),
    id_catalogo_alergia INTEGER REFERENCES Catalogo_Alergia(id_catalogo_alergia),
    reaccion VARCHAR(255),
    nivel_gravedad VARCHAR(50) CHECK (nivel_gravedad IN ('Leve', 'Moderada', 'Grave')),
    fecha_registro DATE NOT NULL,
    observaciones TEXT,
    PRIMARY KEY (id_historial, id_catalogo_alergia)
);

CREATE TABLE Cita (
    id_cita SERIAL PRIMARY KEY,
    id_paciente INTEGER REFERENCES Paciente(id_paciente),
    id_institucion INTEGER REFERENCES Institucion(id_institucion),
    id_usuario_profesional INTEGER REFERENCES Usuario(id_usuario),
    fecha_hora TIMESTAMP NOT NULL,
    motivo_consulta VARCHAR(255),
    estado VARCHAR(50) CHECK (estado IN ('Programada', 'Atendida', 'Cancelada', 'No Asistió')),
    observaciones TEXT,
    fecha_creacion DATE
);

CREATE TABLE Consulta (
    id_consulta SERIAL PRIMARY KEY,
    id_historial INTEGER REFERENCES Historial_Clinico(id_historial),
    id_cita INTEGER REFERENCES Cita(id_cita),
    id_usuario_profesional INTEGER REFERENCES Usuario(id_usuario),
    fecha_hora TIMESTAMP NOT NULL,
    motivo_consulta VARCHAR(255),
    sintomas TEXT,
    examen_fisico TEXT,
    notas_clinicas TEXT,
    estado VARCHAR(50) CHECK (estado IN ('Abierta', 'Finalizada', 'Anulada'))
);

CREATE TABLE Signos_Vitales (
    id_signo_vital SERIAL PRIMARY KEY,
    id_consulta INTEGER UNIQUE REFERENCES Consulta(id_consulta),
    presion_arterial VARCHAR(20),
    temperatura DECIMAL(4,2),
    frecuencia_cardiaca INTEGER,
    frecuencia_respiratoria INTEGER,
    peso DECIMAL(5,2),
    talla DECIMAL(4,2),
    saturacion_oxigeno INTEGER,
    fecha_registro TIMESTAMP NOT NULL
);

CREATE TABLE Catalogo_Diagnostico (
    id_catalogo_diag SERIAL PRIMARY KEY,
    codigo_clinico VARCHAR(20),
    nombre_diagnostico VARCHAR(200) NOT NULL,
    descripcion TEXT
);

CREATE TABLE Diagnostico_Consulta (
    id_consulta INTEGER REFERENCES Consulta(id_consulta),
    id_catalogo_diag INTEGER REFERENCES Catalogo_Diagnostico(id_catalogo_diag),
    tipo VARCHAR(50) CHECK (tipo IN ('Presuntivo', 'Definitivo', 'Seguimiento')),
    fecha_registro DATE NOT NULL,
    observaciones TEXT,
    PRIMARY KEY (id_consulta, id_catalogo_diag)
);

CREATE TABLE Tratamiento (
    id_tratamiento SERIAL PRIMARY KEY,
    id_consulta INTEGER REFERENCES Consulta(id_consulta),
    descripcion TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    indicaciones TEXT,
    estado VARCHAR(20) CHECK (estado IN ('Activo', 'Finalizado', 'Suspendido'))
);

CREATE TABLE Medicamento (
    id_medicamento SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    principio_activo VARCHAR(100),
    presentacion VARCHAR(50),
    concentracion VARCHAR(50),
    estado VARCHAR(20) CHECK (estado IN ('Activo', 'Inactivo'))
);

CREATE TABLE Receta (
    id_receta SERIAL PRIMARY KEY,
    id_consulta INTEGER REFERENCES Consulta(id_consulta),
    fecha_receta DATE NOT NULL,
    indicaciones_generales TEXT
);

CREATE TABLE Detalle_Receta (
    id_detalle_receta SERIAL PRIMARY KEY,
    id_receta INTEGER REFERENCES Receta(id_receta),
    id_medicamento INTEGER REFERENCES Medicamento(id_medicamento),
    dosis VARCHAR(100) NOT NULL,
    frecuencia VARCHAR(100) NOT NULL,
    via_administracion VARCHAR(50),
    duracion VARCHAR(50),
    indicaciones_especificas TEXT
);

CREATE TABLE Auditoria (
    id_auditoria SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES Usuario(id_usuario),
    accion VARCHAR(50) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    id_entidad VARCHAR(50) NOT NULL,
    fecha_hora TIMESTAMP NOT NULL
);

-- ENTIDADES ESPECÍFICAS: HOSPITAL GENERAL

CREATE TABLE Especialidad_Medica (
    id_especialidad SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    estado VARCHAR(20) CHECK (estado IN ('Activa', 'Inactiva'))
);

CREATE TABLE Usuario_Especialidad (
    id_usuario INTEGER REFERENCES Usuario(id_usuario),
    id_especialidad INTEGER REFERENCES Especialidad_Medica(id_especialidad),
    fecha_asignacion DATE NOT NULL,
    PRIMARY KEY (id_usuario, id_especialidad)
);

CREATE TABLE Habitacion (
    id_habitacion SERIAL PRIMARY KEY,
    numero VARCHAR(20) UNIQUE NOT NULL,
    tipo VARCHAR(50) CHECK (tipo IN ('General', 'Privada', 'Aislamiento', 'Intensivos')),
    estado VARCHAR(50) CHECK (estado IN ('Disponible', 'Ocupada', 'Mantenimiento', 'Inactiva')),
    observaciones TEXT
);

CREATE TABLE Hospitalizacion (
    id_hospitalizacion SERIAL PRIMARY KEY,
    id_historial INTEGER REFERENCES Historial_Clinico(id_historial),
    id_usuario_medico INTEGER REFERENCES Usuario(id_usuario),
    fecha_ingreso TIMESTAMP NOT NULL,
    fecha_egreso TIMESTAMP,
    motivo_ingreso VARCHAR(255) NOT NULL,
    diagnostico_ingreso TEXT,
    estado VARCHAR(50) CHECK (estado IN ('Activa', 'Alta', 'Traslado', 'Cancelada')),
    observaciones TEXT
);

CREATE TABLE Hospitalizacion_Habitacion (
    id_hospitalizacion INTEGER REFERENCES Hospitalizacion(id_hospitalizacion),
    id_habitacion INTEGER REFERENCES Habitacion(id_habitacion),
    fecha_traslado TIMESTAMP NOT NULL,
    estado VARCHAR(50) CHECK (estado IN ('Activa', 'Finalizada')),
    PRIMARY KEY (id_hospitalizacion, id_habitacion, fecha_traslado)
);