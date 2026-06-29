# Contributing to Audio Studio

Terima kasih telah tertarik untuk berkontribusi pada Audio Studio! Panduan ini akan membantu Anda memulai.

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Installation

1. Clone repository:
```bash
git clone https://github.com/yourusername/audio-studio.git
cd audio-studio
```

2. Install dependencies:
```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

3. Setup environment variables:
```bash
# Server
cd ../server
cp .env.example .env
# Edit .env sesuai kebutuhan

# Client (opsional)
cd ../client
cp .env.example .env
```

4. Start development servers:
```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Client
cd client
npm run dev
```

5. Buka `http://localhost:5173` di browser

## Code Style

### General

- Gunakan ESLint dan Prettier yang sudah dikonfigurasi
- Jalankan `npm run lint` dan `npm run format` sebelum commit
- Gunakan bahasa Indonesia untuk komentar dan dokumentasi

### JavaScript/Node.js

- Gunakan ES6+ syntax
- Gunakan `const` untuk variabel yang tidak berubah, `let` untuk yang berubah
- Hindari `var`
- Gunakan async/await untuk asynchronous operations
- Gunakan descriptive variable names

### React

- Gunakan functional components dengan hooks
- Pisahkan logic ke custom hooks ketika kompleks
- Gunakan React.memo untuk komponen yang sering re-render
- Gunakan lazy loading untuk halaman berat

### Commits

Gunakan conventional commits format:
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: Fitur baru
- `fix`: Bug fix
- `docs`: Dokumentasi
- `style`: Formatting, semicolons, dll
- `refactor`: Refactoring code
- `test`: Menambah atau memperbaiki tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(server): add WebSocket support for real-time updates
fix(client): resolve audio upload progress bar not updating
docs(readme): add deployment instructions for VPS
refactor(ffmpeg): optimize filter chain building
```

## Pull Request Process

1. Fork repository dan buat branch baru dari `develop`
2. Buat perubahan Anda
3. Tambahkan tests untuk fitur baru
4. Pastikan semua tests pass: `npm test`
5. Pastikan linting pass: `npm run lint`
6. Commit dengan conventional commits format
7. Push ke fork Anda dan buat Pull Request ke `develop`

### PR Requirements

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added untuk logic kompleks
- [ ] Tests added untuk fitur baru
- [ ] Tests pass
- [ ] Documentation updated (jika perlu)
- [ ] No merge conflicts

## Testing

### Server Tests

```bash
cd server
npm test              # Run tests
npm run test:coverage # Run with coverage
npm run test:watch    # Watch mode
```

### Client Tests

```bash
cd client
npm test              # Run tests
npm run test:coverage # Run with coverage
npm run test:ui       # Interactive UI
```

### Coverage Requirements

- Server services: minimal 70%
- Server routes: minimal 50%
- Client components: minimal 50%

## Project Structure

```
audio-studio/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── lib/           # Utility functions
│   │   └── test/          # Test setup
│   └── public/            # Static assets
├── server/                # Express backend
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── middleware/       # Express middleware
│   └── test/             # Tests
└── uploads/              # Temporary audio files
```

## Common Tasks

### Adding a New API Endpoint

1. Tambahkan route di `server/routes/`
2. Implementasi logic di `server/services/`
3. Tambahkan tests di `server/test/`
4. Update `API.md` dengan dokumentasi endpoint

### Adding a New React Component

1. Buat component di `client/src/components/` atau `client/src/pages/`
2. Gunakan existing UI components dari `ui.jsx` jika memungkinkan
3. Tambahkan tests di `client/src/`
4. Update dokumentasi jika perlu

### Updating Dependencies

1. Cek outdated packages: `npm outdated`
2. Update package: `npm install package@latest`
3. Test thoroughly setelah update
4. Update `package-lock.json` dengan commit

## Reporting Issues

### Bug Reports

Gunakan template ini:
```
**Describe the bug**
Jelaskan bug dengan jelas.

**To Reproduce**
Langkah-langkah untuk reproduce:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
Apa yang seharusnya terjadi.

**Screenshots**
Jika ada, tambahkan screenshots.

**Environment:**
- OS: [e.g. Windows 11]
- Browser: [e.g. Chrome 120]
- Node version: [e.g. 20.10.0]

**Additional context**
Informasi tambahan lainnya.
```

### Feature Requests

Gunakan template ini:
```
**Is your feature request related to a problem?**
Jelaskan masalahnya.

**Describe the solution you'd like**
Jelaskan solusi yang Anda inginkan.

**Describe alternatives you've considered**
Alternatif yang sudah dipertimbangkan.

**Additional context**
Informasi tambahan lainnya.
```

## Security Vulnerabilities

Jika Anda menemukan vulnerability keamanan, **JANGAN** buat issue publik. Email ke: [security@yourdomain.com](mailto:security@yourdomain.com)

Lihat [SECURITY.md](SECURITY.md) untuk detail lebih lanjut.

## Questions?

Buka discussion di GitHub atau hubungi maintainer.

## License

Dengan berkontribusi, Anda setuju bahwa kontribusi Anda akan dilisensikan di bawah MIT License.
