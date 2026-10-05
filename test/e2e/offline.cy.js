describe('adapt-mathJax renders offline from the vendored library', function () {
  const external = [];
  const failed = [];

  beforeEach(function () {
    external.length = 0;
    failed.length = 0;

    // Deny everything that is not this server. A vendored build must not reach
    // a CDN; if it does, the request is recorded and the test fails rather than
    // quietly succeeding because the machine happened to be online.
    cy.intercept({ url: '*', middleware: true }, req => {
      if (!req.url.includes('localhost:9001')) {
        external.push(req.url);
        req.destroy();
        return;
      }
      req.on('response', res => {
        if (res.statusCode >= 400) failed.push(`${res.statusCode} ${req.url}`);
      });
    });

    cy.visit('/#/id/co-400', {
      onBeforeLoad (win) {
        cy.spy(win.console, 'error').as('consoleError');
      }
    });
  });

  it('typesets every expression with no errors and no external requests', function () {
    cy.get('mjx-container', { timeout: 20000 }).should('have.length.greaterThan', 0);

    cy.window().then(win => {
      // The config the plugin actually applied, not the one we think it did.
      const config = win.MathJax?.config ?? {};
      // No trailing slash: MathJax resolves `[tex]/noerrors` by concatenating
      // this value with the rest of the name, so a slash here produces
      // `libraries/mathjax/4//input/…`.
      expect(config.loader?.paths?.mathjax, 'loader.paths.mathjax').to.equal('libraries/mathjax/4');
      expect(config.chtml?.fontURL, 'chtml.fontURL').to.equal('libraries/mathjax/4/chtml/woff2');
      expect(win.MathJax?.version, 'MathJax version').to.match(/^4\./);
    });

    // A failed parse renders an merror box; a failed *load* renders nothing and
    // leaves the raw delimiters on the page. Both are checked, because the
    // Phase 0 bench proved a green status bar can hide either.
    cy.get('mjx-merror, merror').should('have.length', 0);
    cy.get('.component__body').invoke('text').should(text => {
      const raw = text.match(/\\\(|\\\[/g) || [];
      expect(raw, `raw TeX delimiters left un-typeset: ${raw.join(' ')}`).to.have.length(0);
    });

    cy.get('@consoleError').should('not.have.been.called');

    cy.then(() => {
      expect(external, `requests left the origin: ${external.join(', ')}`).to.have.length(0);
      expect(failed, `requests failed: ${failed.join(', ')}`).to.have.length(0);
    });
  });

  it('completes typesetting on a revisit, releasing the loading screen', function () {
    // The regression this guards: MathJax's speech action queues one promise per
    // expression that never settles when the speech-rule engine is not vendored.
    // Equations still appear, so the only visible symptom is a loading screen
    // that never lifts — and only from the second render onwards.
    cy.get('mjx-container', { timeout: 20000 }).should('have.length.greaterThan', 0);

    // Any other real page will do; the point is to tear this one down and come
    // back, so that the second typeset is not the document's first render.
    // It must actually exist — navigating to an unknown id leaves the learner
    // on co-400 and the test passes without ever creating the condition.
    cy.visit('/#/id/co-100');
    cy.get('.page', { timeout: 20000 }).should('exist');
    cy.visit('/#/id/co-400');

    cy.get('mjx-container', { timeout: 20000 }).should('have.length.greaterThan', 0);
    cy.get('.loading').should('not.be.visible');
    cy.window().its('MathJax.startup.document._actionPromises').should('have.length', 0);
    cy.window().then(win => {
      expect(win.require('core/js/wait')._waitCount, 'leaked wait count').to.equal(0);
    });
  });

  it('serves the webfont from the vendored path, not a fallback', function () {
    // The silent failure this guards: a wrong fontURL still typesets, in the
    // browser's fallback font, with nothing logged anywhere.
    cy.get('mjx-container', { timeout: 20000 }).should('exist');
    cy.document().then(doc => {
      const rules = [...doc.styleSheets]
        .filter(sheet => {
          try { return sheet.cssRules; } catch { return false; }
        })
        .flatMap(sheet => [...sheet.cssRules])
        .filter(rule => rule.type === CSSRule.FONT_FACE_RULE && /MJX/i.test(rule.style.fontFamily));

      expect(rules, 'MathJax @font-face rules').to.have.length.greaterThan(0);
      rules.forEach(rule => {
        expect(rule.style.src, `@font-face src for ${rule.style.fontFamily}`)
          .to.include('libraries/mathjax/4/chtml/woff2');
      });
    });
  });
});
