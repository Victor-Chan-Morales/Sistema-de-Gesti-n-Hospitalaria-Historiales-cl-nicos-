-- Sin esto, el cliente que carga el script corrompe los ENUM con acentos ('Médico').
SET NAMES utf8mb4;

-- ENTIDADES GENERALES (NORMALIZADAS)

CREATE TABLE Institucion (
    id_institucion INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo_institucion ENUM('Hospital General', 'Clínica Odontológica', 'Laboratorio', 'Pediátrico'),
    direccion VARCHAR(200),
    estado ENUM('Activa', 'Inactiva')
);

CREATE TABLE Telefono_Institucion (
    id_telefono_inst INT AUTO_INCREMENT PRIMARY KEY,
    id_institucion INT,
    numero VARCHAR(20) NOT NULL,
    tipo ENUM('Planta', 'Celular', 'Emergencia'),
    FOREIGN KEY (id_institucion) REFERENCES Institucion(id_institucion)
);

CREATE TABLE Correo_Institucion (
    id_correo_inst INT AUTO_INCREMENT PRIMARY KEY,
    id_institucion INT,
    correo VARCHAR(100) NOT NULL,
    FOREIGN KEY (id_institucion) REFERENCES Institucion(id_institucion)
);

CREATE TABLE Usuario (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    id_institucion INT,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    rol ENUM('Administrador', 'Médico', 'Odontólogo', 'Secretaria', 'Laboratorista'),
    estado ENUM('Activo', 'Inactivo'),
    fecha_creacion DATE,
    ultimo_acceso DATETIME,
    FOREIGN KEY (id_institucion) REFERENCES Institucion(id_institucion)
);

CREATE TABLE Telefono_Usuario (
    id_telefono_usu INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT,
    numero VARCHAR(20) NOT NULL,
    tipo ENUM('Celular', 'Casa', 'Oficina'),
    FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario)
);

CREATE TABLE Correo_Usuario (
    id_correo_usu INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT,
    correo VARCHAR(100) NOT NULL,
    FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario)
);

CREATE TABLE Paciente (
    id_paciente INT AUTO_INCREMENT PRIMARY KEY,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    dpi_o_documento VARCHAR(50) UNIQUE,
    fecha_nacimiento DATE NOT NULL,
    sexo ENUM('M', 'F', 'O'),
    direccion VARCHAR(200),
    estado_civil VARCHAR(50),
    ocupacion VARCHAR(100),
    tipo_sangre ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
    fecha_registro DATE,
    estado ENUM('Activo', 'Archivado', 'Inactivo'),
    motivo_baja VARCHAR(255)
);

CREATE TABLE Telefono_Paciente (
    id_telefono_pac INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT,
    numero VARCHAR(20) NOT NULL,
    tipo ENUM('Celular', 'Casa', 'Trabajo'),
    FOREIGN KEY (id_paciente) REFERENCES Paciente(id_paciente)
);

CREATE TABLE Correo_Paciente (
    id_correo_pac INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT,
    correo VARCHAR(100) NOT NULL,
    FOREIGN KEY (id_paciente) REFERENCES Paciente(id_paciente)
);

CREATE TABLE Contacto_Emergencia (
    id_contacto INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    parentesco VARCHAR(50),
    direccion VARCHAR(200),
    FOREIGN KEY (id_paciente) REFERENCES Paciente(id_paciente)
);

CREATE TABLE Telefono_Contacto (
    id_telefono_cont INT AUTO_INCREMENT PRIMARY KEY,
    id_contacto INT,
    numero VARCHAR(20) NOT NULL,
    tipo ENUM('Celular', 'Casa'),
    FOREIGN KEY (id_contacto) REFERENCES Contacto_Emergencia(id_contacto)
);

CREATE TABLE Representante_Encargado (
    id_representante INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    dpi VARCHAR(50),
    parentesco VARCHAR(50),
    direccion VARCHAR(200),
    FOREIGN KEY (id_paciente) REFERENCES Paciente(id_paciente)
);

CREATE TABLE Telefono_Representante (
    id_telefono_rep INT AUTO_INCREMENT PRIMARY KEY,
    id_representante INT,
    numero VARCHAR(20) NOT NULL,
    tipo ENUM('Celular', 'Casa'),
    FOREIGN KEY (id_representante) REFERENCES Representante_Encargado(id_representante)
);

CREATE TABLE Correo_Representante (
    id_correo_rep INT AUTO_INCREMENT PRIMARY KEY,
    id_representante INT,
    correo VARCHAR(100) NOT NULL,
    FOREIGN KEY (id_representante) REFERENCES Representante_Encargado(id_representante)
);

CREATE TABLE Historial_Clinico (
    id_historial INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT UNIQUE,
    id_institucion INT,
    codigo_historial VARCHAR(50) UNIQUE,
    fecha_apertura DATE NOT NULL,
    estado ENUM('Activo', 'Archivado'),
    fecha_cierre DATE,
    motivo_cierre VARCHAR(255),
    observaciones TEXT,
    FOREIGN KEY (id_paciente) REFERENCES Paciente(id_paciente),
    FOREIGN KEY (id_institucion) REFERENCES Institucion(id_institucion)
);

CREATE TABLE Antecedente_Medico (
    id_antecedente INT AUTO_INCREMENT PRIMARY KEY,
    id_historial INT,
    tipo_antecedente ENUM('Personal', 'Familiar', 'Quirúrgico', 'Patológico', 'Hereditario'),
    descripcion TEXT NOT NULL,
    fecha_registro DATE NOT NULL,
    estado VARCHAR(20),
    observaciones TEXT,
    FOREIGN KEY (id_historial) REFERENCES Historial_Clinico(id_historial)
);

CREATE TABLE Catalogo_Alergia (
    id_catalogo_alergia INT AUTO_INCREMENT PRIMARY KEY,
    sustancia VARCHAR(100) NOT NULL,
    tipo_alergia ENUM('Medicamentosa', 'Alimentaria', 'Ambiental', 'Otra')
);

CREATE TABLE Historial_Alergia (
    id_historial INT,
    id_catalogo_alergia INT,
    reaccion VARCHAR(255),
    nivel_gravedad ENUM('Leve', 'Moderada', 'Grave'),
    fecha_registro DATE NOT NULL,
    observaciones TEXT,
    PRIMARY KEY (id_historial, id_catalogo_alergia),
    FOREIGN KEY (id_historial) REFERENCES Historial_Clinico(id_historial),
    FOREIGN KEY (id_catalogo_alergia) REFERENCES Catalogo_Alergia(id_catalogo_alergia)
);

CREATE TABLE Cita (
    id_cita INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT,
    id_institucion INT,
    id_usuario_profesional INT,
    fecha_hora DATETIME NOT NULL,
    motivo_consulta VARCHAR(255),
    estado ENUM('Programada', 'Atendida', 'Cancelada', 'No Asistió'),
    observaciones TEXT,
    fecha_creacion DATE,
    FOREIGN KEY (id_paciente) REFERENCES Paciente(id_paciente),
    FOREIGN KEY (id_institucion) REFERENCES Institucion(id_institucion),
    FOREIGN KEY (id_usuario_profesional) REFERENCES Usuario(id_usuario)
);

CREATE TABLE Consulta (
    id_consulta INT AUTO_INCREMENT PRIMARY KEY,
    id_historial INT,
    id_cita INT NULL,
    id_usuario_profesional INT,
    fecha_hora DATETIME NOT NULL,
    motivo_consulta VARCHAR(255),
    sintomas TEXT,
    examen_fisico TEXT,
    notas_clinicas TEXT,
    estado ENUM('Abierta', 'Finalizada', 'Anulada'),
    FOREIGN KEY (id_historial) REFERENCES Historial_Clinico(id_historial),
    FOREIGN KEY (id_cita) REFERENCES Cita(id_cita),
    FOREIGN KEY (id_usuario_profesional) REFERENCES Usuario(id_usuario)
);

CREATE TABLE Signos_Vitales (
    id_signo_vital INT AUTO_INCREMENT PRIMARY KEY,
    id_consulta INT UNIQUE,
    presion_arterial VARCHAR(20),
    temperatura DECIMAL(4,2),
    frecuencia_cardiaca INT,
    frecuencia_respiratoria INT,
    peso DECIMAL(5,2),
    talla DECIMAL(5,2),
    saturacion_oxigeno INT,
    fecha_registro DATETIME NOT NULL,
    FOREIGN KEY (id_consulta) REFERENCES Consulta(id_consulta)
);

CREATE TABLE Catalogo_Diagnostico (
    id_catalogo_diag INT AUTO_INCREMENT PRIMARY KEY,
    codigo_clinico VARCHAR(20),
    nombre_diagnostico VARCHAR(200) NOT NULL,
    descripcion TEXT
);

CREATE TABLE Diagnostico_Consulta (
    id_consulta INT,
    id_catalogo_diag INT,
    tipo ENUM('Presuntivo', 'Definitivo', 'Seguimiento'),
    fecha_registro DATE NOT NULL,
    observaciones TEXT,
    PRIMARY KEY (id_consulta, id_catalogo_diag),
    FOREIGN KEY (id_consulta) REFERENCES Consulta(id_consulta),
    FOREIGN KEY (id_catalogo_diag) REFERENCES Catalogo_Diagnostico(id_catalogo_diag)
);

CREATE TABLE Tratamiento (
    id_tratamiento INT AUTO_INCREMENT PRIMARY KEY,
    id_consulta INT,
    descripcion TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    indicaciones TEXT,
    estado ENUM('Activo', 'Finalizado', 'Suspendido'),
    FOREIGN KEY (id_consulta) REFERENCES Consulta(id_consulta)
);

CREATE TABLE Medicamento (
    id_medicamento INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    principio_activo VARCHAR(100),
    presentacion VARCHAR(50),
    concentracion VARCHAR(50),
    estado ENUM('Activo', 'Inactivo')
);

CREATE TABLE Receta (
    id_receta INT AUTO_INCREMENT PRIMARY KEY,
    id_consulta INT,
    fecha_receta DATE NOT NULL,
    indicaciones_generales TEXT,
    FOREIGN KEY (id_consulta) REFERENCES Consulta(id_consulta)
);

CREATE TABLE Detalle_Receta (
    id_detalle_receta INT AUTO_INCREMENT PRIMARY KEY,
    id_receta INT,
    id_medicamento INT,
    dosis VARCHAR(100) NOT NULL,
    frecuencia VARCHAR(100) NOT NULL,
    via_administracion VARCHAR(50),
    duracion VARCHAR(50),
    indicaciones_especificas TEXT,
    FOREIGN KEY (id_receta) REFERENCES Receta(id_receta),
    FOREIGN KEY (id_medicamento) REFERENCES Medicamento(id_medicamento)
);

CREATE TABLE Auditoria (
    id_auditoria INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    accion VARCHAR(50) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    id_entidad VARCHAR(50) NOT NULL,
    fecha_hora DATETIME NOT NULL,
    FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario)
);

-- ENTIDADES ESPECÍFICAS: CLÍNICA ODONTOLÓGICA

CREATE TABLE Odontograma (
    id_odontograma INT AUTO_INCREMENT PRIMARY KEY,
    id_historial INT,
    fecha_registro DATE NOT NULL,
    observaciones TEXT,
    FOREIGN KEY (id_historial) REFERENCES Historial_Clinico(id_historial)
);

CREATE TABLE Pieza_Dental (
    id_pieza_dental INT AUTO_INCREMENT PRIMARY KEY,
    id_odontograma INT,
    numero_pieza INT NOT NULL,
    estado ENUM('Sana', 'Caries', 'Ausente', 'Restaurada', 'Fracturada'),
    observaciones TEXT,
    UNIQUE (id_odontograma, numero_pieza),
    FOREIGN KEY (id_odontograma) REFERENCES Odontograma(id_odontograma)
);

CREATE TABLE Procedimiento_Odontologico (
    id_procedimiento INT AUTO_INCREMENT PRIMARY KEY,
    id_consulta INT,
    nombre_procedimiento VARCHAR(100) NOT NULL,
    descripcion TEXT,
    fecha_realizacion DATE NOT NULL,
    costo_referencial DECIMAL(10,2),
    observaciones TEXT,
    FOREIGN KEY (id_consulta) REFERENCES Consulta(id_consulta)
);