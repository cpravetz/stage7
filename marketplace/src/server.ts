import app from './app';

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Marketplace service listening on port ${PORT}`);
    });
}
