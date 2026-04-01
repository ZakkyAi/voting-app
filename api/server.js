// Local dev server wrapper (not used in production/Vercel)
const app = require('./index');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
