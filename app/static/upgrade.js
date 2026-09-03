/* v15：左栏 = 模块入口 + 项目卡 + 步骤导航 + 底部「设置」按钮（打开设置弹窗）；
   界面缩放/色调移入设置弹窗「界面」tab（localStorage 持久化）。
   v26 主题体系：全站只保留两套主题——
   天蓝 = 暖米色纸底 + 蓝色强调（按钮/滑轨/悬浮），默认主题；
   黑白 = 与设置弹窗一致的中性商务黑白（配合 body.biz 样式层）。
   只移动 DOM 节点、不改任何事件逻辑；删除本文件及引用即恢复原样。 */
(function () {
  /* 每套都是完整调色板：强调色三件套（main/deep/soft）+ 墨色 ink（文字/边框/深色底）、
     inkSoft 次级文字、paper/paper2/card 背景、line/lineMid 边框、wash/wash2 内嵌底色，
     以及两份 rgb 供 rgba 阴影光晕使用。CSS 里不允许再写死颜色。 */
  var HUES = {
    sky:    { name: '天蓝', main: '#8ecdf5', deep: '#5aaee8', soft: '#e6f3fd', rgb: '142,205,245',
              ink: '#14283f', inkRgb: '20,40,63', inkSoft: '#4a5a6e',
              paper: '#f1efe3', paper2: '#e9e7d6', card: '#fdfcf6',
              line: '#d4d6c0', lineMid: '#b9bfa6', wash: '#f7f6ec', wash2: '#eeece0' },
    /* 黑白：强调色用浅灰，保证「浅底配墨字」的组合可读（配合 body.biz 样式层） */
    mono:   { name: '黑白', main: '#e8e8e8', deep: '#8a8a8a', soft: '#f1f1f1', rgb: '232,232,232',
              ink: '#111111', inkRgb: '17,17,17', inkSoft: '#666666',
              paper: '#f6f6f6', paper2: '#ececec', card: '#ffffff',
              line: '#d7d7d7', lineMid: '#bdbdbd', wash: '#f4f4f4', wash2: '#e9e9e9',
              swatch: 'linear-gradient(135deg, #111 50%, #fff 50%)' }
  };

  function applyHue(k) {
    var h = HUES[k]; if (!h) return;
    document.body.classList.toggle('biz', k === 'mono');
    var s = document.documentElement.style;
    s.setProperty('--lime', h.main);
    s.setProperty('--lime-deep', h.deep);
    s.setProperty('--lime-soft', h.soft);
    s.setProperty('--lime-rgb', h.rgb);
    s.setProperty('--ink', h.ink);
    s.setProperty('--ink-rgb', h.inkRgb);
    s.setProperty('--ink-soft', h.inkSoft);
    s.setProperty('--paper', h.paper);
    s.setProperty('--paper-2', h.paper2);
    s.setProperty('--card', h.card);
    s.setProperty('--line', h.line);
    s.setProperty('--line-mid', h.lineMid);
    s.setProperty('--wash', h.wash);
    s.setProperty('--wash-2', h.wash2);
    /* 旧版样式仍引用 olive 变量。同步赋值，避免黑白模式继承到历史橄榄色。 */
    s.setProperty('--olive', k === 'mono' ? '#111111' : h.deep);
    s.setProperty('--olive-deep', k === 'mono' ? '#111111' : h.deep);
    s.setProperty('--soft-olive', h.soft);
  }
  function applyScale(v) {
    var html = document.documentElement;
    var base = parseFloat(html.dataset.baseFs || '');
    if (!base) {
      base = parseFloat(getComputedStyle(html).fontSize) || 16;
      html.dataset.baseFs = base;
    }
    html.style.fontSize = (base * v) + 'px';
  }

  function init() {
    var drawer = document.querySelector('.workflow-drawer');
    if (!drawer) return;

    /* 1) 模块入口：创作 / 素材库（占位） */
    if (!drawer.querySelector('.module-nav')) {
      var nav = document.createElement('div');
      nav.className = 'module-nav';
      nav.innerHTML =
        '<button type="button" class="active">创作</button>' +
        '<button type="button" class="soon" title="素材库页面即将上线" disabled>素材库</button>';
      drawer.insertBefore(nav, drawer.firstChild);
    }

    /* 2) 项目卡：把顶栏右侧的 保存/新建/项目记录/最近项目 收进来 */
    var save = document.getElementById('save-btn'),
        nb = document.getElementById('new-project-btn'),
        mb = document.getElementById('manage-btn'),
        sw = document.getElementById('project-switcher');
    if (nb && mb && sw && !drawer.querySelector('.project-card')) {
      var card = document.createElement('div');
      card.className = 'project-card';
      var r1 = document.createElement('div'); r1.className = 'pc-row';
      if (save) r1.appendChild(save);
      r1.appendChild(nb);
      var r2 = document.createElement('div'); r2.className = 'pc-row';
      r2.appendChild(mb);
      card.appendChild(r1); card.appendChild(r2); card.appendChild(sw);
      drawer.insertBefore(card, drawer.children[1] || null);
      document.body.classList.add('relocated');
    }

    /* 3) 左栏底部：设置按钮（打开设置弹窗）；界面字号/色调移入弹窗「界面」tab（localStorage 持久化） */
    if (!drawer.querySelector('.settings-card')) {
      var sc = document.createElement('div');
      sc.className = 'settings-card';
      sc.innerHTML = '<button type="button" id="drawer-settings-btn" title="字号、颜色、API Key、界面都在这里">⚙ 设置</button>';
      drawer.appendChild(sc);
      sc.querySelector('#drawer-settings-btn').addEventListener('click', function () {
        if (window._openSettings) window._openSettings('accounts');
      });
    }

    var uiPane = document.getElementById('settings-ui');
    if (uiPane && !uiPane.querySelector('.set-row')) {
      var box = document.createElement('div');
      box.className = 'group-card';
      box.innerHTML =
        '<p class="group-title">界面</p>' +
        '<div class="set-row"><span class="set-label">缩放</span>' +
        '<button type="button" id="fs-minus">A−</button>' +
        '<button type="button" id="fs-plus">A＋</button></div>' +
        '<div class="set-row"><span class="set-label">色调</span><span class="hue-dots"></span></div>';
      uiPane.appendChild(box);

      var scale = parseFloat(localStorage.getItem('ui-fs') || '1');
      function step(d) {
        scale = Math.min(1.4, Math.max(0.8, Math.round((scale + d) * 100) / 100));
        localStorage.setItem('ui-fs', scale);
        applyScale(scale);
      }
      box.querySelector('#fs-minus').addEventListener('click', function () { step(-0.05); });
      box.querySelector('#fs-plus').addEventListener('click', function () { step(0.05); });
      var dots = box.querySelector('.hue-dots');
      Object.keys(HUES).forEach(function (k) {
        var h = HUES[k];
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'hue-dot';
        b.dataset.hue = k;
        /* 色样画在内层圆点上：设置弹窗对 button 本身有黑底 !important 规则，
           直接给按钮上色会被盖掉；带名称文字也让人一眼看懂每个选项是什么颜色 */
        var swEl = document.createElement('span');
        swEl.className = 'sw';
        swEl.style.background = h.swatch || h.main;
        b.appendChild(swEl);
        b.appendChild(document.createTextNode(h.name));
        b.addEventListener('click', function () {
          localStorage.setItem('ui-hue', k); applyHue(k); mark();
        });
        dots.appendChild(b);
      });
      function mark() {
        var cur = localStorage.getItem('ui-hue') || 'sky';
        dots.querySelectorAll('.hue-dot').forEach(function (d) {
          d.classList.toggle('active', d.dataset.hue === cur);
        });
      }
      mark();
    }

    /* 4) 应用持久化偏好；默认主题 = 「天蓝」（暖米色纸底 + 蓝色强调）。
       历次迁移统一收敛为一条规则：存档不是可选主题
       （含首次使用、存了已删除的旧色相）时，一律回到默认「天蓝」。 */
    var savedHue = localStorage.getItem('ui-hue');
    if (!HUES[savedHue]) {
      savedHue = 'sky';
      localStorage.setItem('ui-hue', savedHue);
    }
    applyHue(savedHue);
    var fs = parseFloat(localStorage.getItem('ui-fs') || '1');
    if (fs !== 1) applyScale(fs);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
