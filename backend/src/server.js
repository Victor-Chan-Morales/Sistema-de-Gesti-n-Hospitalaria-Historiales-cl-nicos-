require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ estado: 'ok' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
