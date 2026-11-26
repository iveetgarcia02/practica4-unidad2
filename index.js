const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = 3000;

// --- BASE DE DATOS NATIVA DE NODE.JS (Crea base_datos.db automáticamente) ---
const db = new DatabaseSync('base_datos.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS recursos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    categoria TEXT,
    precio REAL,
    stock INTEGER
  )
`);

// --- PARTE I: Configuración de Multer (Subida de archivos) ---
const upload = multer({ dest: 'uploads/' });

// --- PARTE II: Importación (POST /api/recursos/importar) ---
app.post('/api/recursos/importar', upload.single('archivo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se envió ningún archivo en el campo "archivo".' });
  }

  const rutaArchivo = req.file.path;
  const extension = path.extname(req.file.originalname).toLowerCase();

  const insertar = db.prepare(
    'INSERT INTO recursos (nombre, categoria, precio, stock) VALUES (?, ?, ?, ?)'
  );

  // CASO A: Si el archivo es .json
  if (extension === '.json') {
    try {
      const contenido = fs.readFileSync(rutaArchivo, 'utf8');
      const datos = JSON.parse(contenido);

      for (const item of datos) {
        insertar.run(item.nombre, item.categoria, Number(item.precio), Number(item.stock));
      }

      fs.unlinkSync(rutaArchivo); // Elimina el archivo temporal

      return res.status(200).json({
        mensaje: 'Datos JSON importados correctamente',
        totalInsertados: datos.length,
      });
    } catch (error) {
      if (fs.existsSync(rutaArchivo)) fs.unlinkSync(rutaArchivo);
      return res.status(500).json({ error: 'Error al procesar el archivo JSON', detalle: error.message });
    }
  }

  // CASO B: Si el archivo es .csv
  if (extension === '.csv') {
    const resultados = [];

    fs.createReadStream(rutaArchivo)
      .pipe(csv())
      .on('data', (fila) => {
        resultados.push(fila);
      })
      .on('end', () => {
        try {
          for (const item of resultados) {
            insertar.run(item.nombre, item.categoria, Number(item.precio), Number(item.stock));
          }

          fs.unlinkSync(rutaArchivo); // Elimina el archivo temporal

          return res.status(200).json({
            mensaje: 'Datos CSV importados correctamente',
            totalInsertados: resultados.length,
          });
        } catch (error) {
          if (fs.existsSync(rutaArchivo)) fs.unlinkSync(rutaArchivo);
          return res.status(500).json({ error: 'Error al guardar CSV en BD', detalle: error.message });
        }
      });
    return;
  }

  fs.unlinkSync(rutaArchivo);
  return res.status(400).json({ error: 'Formato no válido. Solo se permiten archivos .json o .csv' });
});

// --- PARTE III: Exportación (GET /api/recursos/exportar/:formato) ---
app.get('/api/recursos/exportar/:formato', (req, res) => {
  const formato = req.params.formato.toLowerCase();
  const registros = db.prepare('SELECT * FROM recursos').all();

  if (formato === 'json') {
    res.setHeader('Content-Disposition', 'attachment; filename=datos_exportados.json');
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(registros, null, 2));
  }

  if (formato === 'csv') {
    try {
      const parser = new Parser();
      const csvData = registros.length > 0 ? parser.parse(registros) : 'id,nombre,categoria,precio,stock';

      res.setHeader('Content-Disposition', 'attachment; filename=datos_exportados.csv');
      res.setHeader('Content-Type', 'text/csv');
      return res.send(csvData);
    } catch (error) {
      return res.status(500).json({ error: 'Error al generar el CSV', detalle: error.message });
    }
  }

  return res.status(400).json({ error: 'Formato no soportado. Usa /json o /csv' });
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en http://localhost:" + PORT);
});