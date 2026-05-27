# Terax — Geliştirme Notları

Bu dosya, projenin mevcut kod tabanı üzerinden yapılan inceleme sonucunda çıkarılan sorunları ve geliştirme önerilerini içerir. Roadmap'ten değil, gerçek kodun durumundan türetilmiştir.

## Projenin Genel Durumu

Terax iyi tasarlanmış bir proje:
- Net mimari (Rust backend + React frontend)
- Güvenlik konusunda dikkatli (deny-list, SSRF guard, workspace auth)
- Aktif geliştiriliyor (son commit'ler hardening odaklı)

Ama bazı boşluklar var.

---

## En Önemli Sorunlar

### 1. Test eksikliği çok ciddi

Toplam 295 kaynak dosya var, ama sadece **6 frontend test** ve **4 Rust test** mevcut. 18 frontend modülünden 13'ünde hiç test yok:

- editor
- explorer
- tabs
- sidebar
- git-history
- markdown
- statusbar
- workspace
- agents
- updater
- source-control
- theme
- settings
- shortcuts
- header

Rust tarafında ise PTY, agent, net, workspace auth modüllerinde test yok. Bu da bir şey değiştirdiğinde başka bir yerin kırıldığını fark etmeyi zorlaştırıyor.

### 2. App.tsx çok büyük (1608 satır)

Bu dosya aslında sadece "koordinatör" olmalıydı, ama her şeyi taşıyor:
- Tab yönetimi
- Terminal yaşam döngüsü
- Editör state'i
- Kısayollar
- Ayarlar

Hepsi tek dosyada. Test edilmesi ve değiştirilmesi zor.

### 3. Bundle gereksiz yere büyük

Şu an her şey baştan yükleniyor:

| Paket | Adet | Tahmini Boyut |
|---|---|---|
| `@ai-sdk/*` (provider) | 8 | ~2 MB |
| `@codemirror/lang-*` | 9 | ~500 KB |
| `@uiw/codemirror-theme-*` | 8 | ~200 KB |
| `@xterm/addon-*` | 5 | ~150 KB |

Kullanıcı tek bir provider kullansa bile hepsi yükleniyor.

### 4. Sessiz hatalar var

Bazı yerlerde hata oluşunca kullanıcıya hiç gösterilmiyor:

- `src/modules/explorer/ExplorerSearch.tsx:128` — arama başarısız olursa boş liste gösteriliyor, "hata oldu" denmiyor.
- `src/modules/terminal/lib/rendererPool.ts:129,195,207` — `.catch(() => {})` boş, WebGL fallback sinyali yok.

### 5. Rust kodunda 102 `unwrap()` var

Bunlar lock veya state erişimlerinde. Lock "poisoned" olursa (bir thread panik atarsa) tüm uygulama çöker. Özellikle:

- `src-tauri/src/modules/pty/mod.rs:67,77,89,109,119,135`
- `src-tauri/src/modules/pty/session.rs:232,327,336`

### 6. UI/UX boşlukları

- Terminal'de boş state yok (yeni tab boş bir pane gösteriyor).
- `ShortcutsDialog` hızlı bakış modalı; düzenleme Settings'te (orada arama mevcut).
- `AiMiniWindow` sürükleme sırasında görsel feedback yok.
- `CwdBreadcrumb` küçük viewport'ta tooltip göstermiyor.

### 7. Güvenlik denetimi gerek

- `fs_create_file`, `fs_delete`, `fs_rename` komutlarında workspace auth check'i explicit değil. Caller'a güveniyor.
- `shell::shell_bg_spawn` cwd doğrulaması yetersiz.

### 8. Son commit'ler kırılgan alanları gösteriyor

- `fix(terminal): bracketed-paste multiline & repaint stale slot` — paste + render race
- `fix(windows,terminal): System32 launch dir, PTY reload reap` — Windows PTY lifecycle
- `feat(agents): notifications` — yeni özellik, test yok
- `feat(ai): mini window draggable` — multi-monitor edge case'leri belirsiz

---

## Yapılabilecek Geliştirmeler

### Hızlı Kazanımlar (1-2 saatlik işler)

Küçük ama kullanıcı deneyimini hemen iyileştirir:

1. **Explorer'da arama hata bildirimi** — Sonner zaten kurulu, ~5 satır.
2. **Terminal render hata mesajları** — WebGL başarısız olunca kullanıcıya bildir.
3. **Boş ekran state'leri** — Yeni terminal/editör/AI sekmesi boşken yönlendirme göster.
4. **AI mini pencerede sürükleme görselleştirmesi** — `cursor-grabbing` + outline.

### Orta Vadeli İşler (Yarım gün - 1 gün)

Bundle ve performans odaklı:

5. **Editör dillerini lazy load** — Sadece açılan dosyanın dilini yükle. ~300 KB tasarruf.
6. **AI provider'ları lazy load** — Sadece seçili provider yüklensin. ~1.5 MB tasarruf.
7. **Editör temalarını lazy load** — Sadece aktif tema yüklensin.
8. **Rust `unwrap()`'leri düzelt** — Lock hatalarında uygulama çökmek yerine hata logla. Önce PTY modülü.
9. **İlk testler** — `tabs`, `editor`, `explorer` modülleri için temel testler.
10. **Güvenlik denetimi** — Tüm `fs_*` ve `shell_*` komutlarının workspace yetkilendirmesinden geçtiğini doğrula.

### Büyük İşler (2-5 gün)

Yapısal değişiklikler ve yeni özellikler:

11. **App.tsx'i parçala** — TabsProvider, TerminalProvider, EditorProvider, ShortcutsProvider olarak böl. 1608 satır → ~600 + 4 provider.
12. **PTY ve Agent entegrasyon testleri** — Son fix'lerin regresyon koruması için harness.
13. **SSH desteği** — Roadmap'te ilk sırada ama hiç başlanmamış. `russh` crate ile yapılabilir.

### Yeni Özellik Önerileri

Kod yapısına uygun, gerçekçi öneriler:

14. **MCP (Model Context Protocol) desteği** — AI tool'larını eklenti gibi yükleyebilmek için. `tools/tools.ts` registry'sini dinamik MCP client'larıyla genişlet.
15. **Terminal'de inline auto-suggest** — Fish/Warp tarzı, geçmişe dayalı gri öneriler.
16. **Proje bazlı güven manifesti** — `.terax/trust.json` ile "bu projede `npm install` otomatik onaylansın" denebilir. Approval fatigue azalır.
17. **Komut paleti zenginleştirme** — Sadece kısayollar değil dosya açma + git eylemleri + AI snippet'leri aynı arama içinde.
18. **TERAX.md görsel editör** — Proje hafızasını UI'dan yönetmek.

---

## Önceliklendirilmiş Yol Haritası

Sırasıyla yapılırsa anlamlı bir momentum oluşturur.

### Hafta 1 — UX Polish

- Madde 1, 2, 3, 4 (yukarıdaki "Hızlı Kazanımlar")
- Toplam: yarım gün, ~4 küçük PR
- Sonuç: Kullanıcı sessiz hatadan kurtulur, ilk impressions iyileşir

### Hafta 2 — Bundle Optimizasyonu

- Madde 5, 6, 7
- Toplam: 1-2 gün
- Sonuç: Bundle ~2 MB düşer, ilk yükleme hızlanır

### Hafta 3 — Hardening

- Madde 8 (unwrap düzeltmeleri)
- Madde 10 (güvenlik audit)
- Madde 9 (ilk testler)
- Toplam: 2-3 gün
- Sonuç: Crash'lere karşı dayanıklılık, güvenlik garantisi

### Hafta 4+ — Yapısal İyileştirmeler

- Madde 11 (App.tsx refactor)
- Madde 12 (PTY/Agent test harness)
- Sonuç: Sonraki geliştirmelerin maliyeti düşer

### Sonra — Yeni Özellikler

- Madde 13 (SSH)
- Madde 14 (MCP)
- Madde 15 (inline auto-suggest)
- vs.

---

## Kaynak: Tarama Yöntemi

Bulgular şu komutlarla elde edildi:

- `git log --oneline -40` — son değişiklikler ve kırılgan alanlar
- `find ... | wc -l` — dosya sayısı (295)
- Test dosyalarının listesi (6 frontend + 4 Rust)
- `App.tsx` satır sayısı (1608)
- `package.json` bağımlılık analizi
- Kod tabanında `unwrap()`, `catch(() => {})`, TODO/FIXME taraması
- IPC komut listesi ve workspace auth çağrı kontrolü
