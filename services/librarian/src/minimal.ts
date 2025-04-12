import express from 'express';

const app = express();
const port = process.env.PORT || 5040;

app.get('/health', (req, res) => {
  res.status(200).send('Librarian service is healthy (minimal version)');
});

app.listen(port, () => {
  console.log(`Librarian (minimal version) listening on port ${port}`);
});
