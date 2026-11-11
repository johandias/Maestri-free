/**
 * Maestri Desktop — Vector Asset Catalog & Anti-Slop Design System
 * 
 * 100% Pure Inline SVG Icons (viewBox="0 0 24 24", fill="none", stroke="currentColor", stroke-width="2")
 * Padrão Cromático Bússola Clean:
 * - Azul Profundo: #015089
 * - Turquesa: #02b5e2
 * - Suave: #c2ebfc
 * - Marinho: #002647
 * - Branco: #ffffff
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const assets = factory();
    root.MAESTRI_ICONS = assets.MAESTRI_ICONS;
    root.MAESTRI_APPEARANCE_LIST = assets.MAESTRI_APPEARANCE_LIST;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  // 1. Ícones da Topbar (8 Ferramentas Principais)
  const topbar = {
    pointer: `<svg ${SVG_ATTRS}><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>`,
    chat: `<svg ${SVG_ATTRS}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    terminal: `<svg ${SVG_ATTRS}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
    attachment: `<svg ${SVG_ATTRS}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.49-8.49a4 4 0 0 1 5.66 5.66l-8.49 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78"/></svg>`,
    folder: `<svg ${SVG_ATTRS}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
    portal: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
    note: `<svg ${SVG_ATTRS}><path d="M15.5 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 4z"/><polyline points="15 4 15 9 20 9"/><path d="M6 16l3-8 3 8"/><line x1="7" y1="13.5" x2="11" y2="13.5"/></svg>`,
    pen: `<svg ${SVG_ATTRS}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`
  };

  // 2. Ícones da Secondary Action Bar (6 Ações Rápidas)
  const actionbar = {
    edit: `<svg ${SVG_ATTRS}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    binder: `<svg ${SVG_ATTRS}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 3H4a2 2 0 0 0-2 2v2"/><line x1="2" y1="11" x2="22" y2="11"/></svg>`,
    view: `<svg ${SVG_ATTRS}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    palette: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5.5" r="1.5"/><circle cx="17.5" cy="8.5" r="1.5"/><circle cx="17.5" cy="15.5" r="1.5"/><circle cx="6.5" cy="15.5" r="1.5"/></svg>`,
    reload: `<svg ${SVG_ATTRS}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/></svg>`,
    delete: `<svg ${SVG_ATTRS}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
  };

  // 3. Grid de 32 Ícones da Aba 'Aparência' do Modal (Print 6 Oficial)
  const appearance32 = {
    smile: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    prompt: `<svg ${SVG_ATTRS}><path d="m7 6 6 6-6 6"/><line x1="15" y1="18" x2="19" y2="18"/></svg>`,
    sparkle: `<svg ${SVG_ATTRS}><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>`,
    brain: `<svg ${SVG_ATTRS}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04zm5 0A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/></svg>`,
    shield: `<svg ${SVG_ATTRS}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    chat: `<svg ${SVG_ATTRS}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    gear: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    square: `<svg ${SVG_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`,
    dualTerminal: `<svg ${SVG_ATTRS}><rect x="2" y="3" width="13" height="13" rx="2"/><path d="M16 8h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-2"/><path d="m6 8 2 2-2 2"/></svg>`,
    globe: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    hammer: `<svg ${SVG_ATTRS}><path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9"/><path d="M17.64 4.36 19.4 6.12a2 2 0 0 1 0 2.83L17 11.37l-5.66-5.66 2.42-2.42a2 2 0 0 1 2.83 0l1.05 1.07z"/><path d="m14 13 4 4"/></svg>`,
    screwdriver: `<svg ${SVG_ATTRS}><path d="M18 2l4 4-2 2-4-4 2-2z"/><path d="M14 6l-9 9v4h4l9-9-4-4z"/><path d="M5 19l-3 3"/></svg>`,
    lightning: `<svg ${SVG_ATTRS}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    chip: `<svg ${SVG_ATTRS}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    cpu: `<svg ${SVG_ATTRS}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>`,
    laptop: `<svg ${SVG_ATTRS}><rect x="4" y="5" width="16" height="10" rx="1.5"/><path d="M2 19h20M7 15h10"/></svg>`,
    monitor: `<svg ${SVG_ATTRS}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    pin: `<svg ${SVG_ATTRS}><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>`,
    folder: `<svg ${SVG_ATTRS}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    document: `<svg ${SVG_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    cube: `<svg ${SVG_ATTRS}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    shieldCheck: `<svg ${SVG_ATTRS}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
    eye: `<svg ${SVG_ATTRS}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    microphone: `<svg ${SVG_ATTRS}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    flame: `<svg ${SVG_ATTRS}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
    badge: `<svg ${SVG_ATTRS}><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/></svg>`,
    lightbulb: `<svg ${SVG_ATTRS}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,
    leaf: `<svg ${SVG_ATTRS}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
    flask: `<svg ${SVG_ATTRS}><path d="M10 2v5.5L4.47 18.2a2 2 0 0 0 1.73 2.8h11.6a2 2 0 0 0 1.73-2.8L14 7.5V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/><line x1="7" y1="14" x2="17" y2="14"/></svg>`,
    graduationCap: `<svg ${SVG_ATTRS}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    book: `<svg ${SVG_ATTRS}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    barChart: `<svg ${SVG_ATTRS}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`
  };

  // 4. Mini Dock HUD (5 Ferramentas de Visualização)
  const hud = {
    layers: `<svg ${SVG_ATTRS}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    target: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>`,
    minimap: `<svg ${SVG_ATTRS}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
    zoomMinus: `<svg ${SVG_ATTRS}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    zoomPlus: `<svg ${SVG_ATTRS}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`
  };

  // Lista ordenada de 32 itens para iteração na UI do Modal (Aba Aparência)
  const MAESTRI_APPEARANCE_LIST = [
    { id: "smile", label: "Emoji / Rosto", svg: appearance32.smile },
    { id: "prompt", label: "Prompt (>_)", svg: appearance32.prompt },
    { id: "sparkle", label: "Centelha / Sparkle", svg: appearance32.sparkle },
    { id: "brain", label: "Cérebro / IA", svg: appearance32.brain },
    { id: "shield", label: "Escudo / Proteção", svg: appearance32.shield },
    { id: "chat", label: "Balão Chat", svg: appearance32.chat },
    { id: "gear", label: "Engrenagem", svg: appearance32.gear },
    { id: "square", label: "Quadrado", svg: appearance32.square },
    { id: "dualTerminal", label: "Terminal Duplo", svg: appearance32.dualTerminal },
    { id: "globe", label: "Globo / Rede", svg: appearance32.globe },
    { id: "hammer", label: "Martelo / Build", svg: appearance32.hammer },
    { id: "screwdriver", label: "Chave de Fenda", svg: appearance32.screwdriver },
    { id: "lightning", label: "Raio / Performance", svg: appearance32.lightning },
    { id: "chip", label: "Chip Integrado", svg: appearance32.chip },
    { id: "cpu", label: "CPU / Processador", svg: appearance32.cpu },
    { id: "laptop", label: "Laptop / Dev", svg: appearance32.laptop },
    { id: "monitor", label: "Monitor / Tela", svg: appearance32.monitor },
    { id: "pin", label: "Alfinete / Fixar", svg: appearance32.pin },
    { id: "folder", label: "Pasta de Arquivos", svg: appearance32.folder },
    { id: "document", label: "Documento de Texto", svg: appearance32.document },
    { id: "cube", label: "Cubo / Módulo", svg: appearance32.cube },
    { id: "shieldCheck", label: "Escudo com Check", svg: appearance32.shieldCheck },
    { id: "eye", label: "Olho / Observador", svg: appearance32.eye },
    { id: "microphone", label: "Microfone / Voz", svg: appearance32.microphone },
    { id: "flame", label: "Fogo / Trending", svg: appearance32.flame },
    { id: "badge", label: "Crachá / Perfil", svg: appearance32.badge },
    { id: "lightbulb", label: "Lâmpada / Ideia", svg: appearance32.lightbulb },
    { id: "leaf", label: "Folha / Ecossistema", svg: appearance32.leaf },
    { id: "flask", label: "Frasco de Química", svg: appearance32.flask },
    { id: "graduationCap", label: "Capelo / Academy", svg: appearance32.graduationCap },
    { id: "book", label: "Livro / Docs", svg: appearance32.book },
    { id: "barChart", label: "Gráfico de Barras", svg: appearance32.barChart }
  ];

  const MAESTRI_ICONS = {
    topbar,
    actionbar,
    appearance32,
    hud,
    render(svgString, size = 16, customClass = '') {
      if (!svgString) return '';
      let res = svgString;
      if (size) {
        res = res.replace('<svg ', `<svg width="${size}" height="${size}" `);
      }
      if (customClass) {
        res = res.replace('<svg ', `<svg class="${customClass}" `);
      }
      return res;
    },
    get(category, name) {
      if (MAESTRI_ICONS[category] && MAESTRI_ICONS[category][name]) {
        return MAESTRI_ICONS[category][name];
      }
      return null;
    }
  };

  return { MAESTRI_ICONS, MAESTRI_APPEARANCE_LIST };
});
