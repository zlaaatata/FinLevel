(() => {
  "use strict";

  const REVEAL_DELAY_MS = 120;
  const INTERACTION_FEEDBACK_MS = 220;
  const MAX_RECOMMENDATIONS = 3;
  const FINANCIAL_HEALTH_LEVEL = 62;
  const LEVEL_RING_SEGMENTS = 72;

  /**
   * Weighted score model for recommendation ranking.
   * Weights sum to 1.0 for predictable normalization.
   */
  const SCORE_WEIGHTS = Object.freeze({
    severity: 0.35,
    urgency: 0.3,
    impact: 0.2,
    effort: 0.1,
    priorityBoost: 0.05,
  });

  /**
   * Stateful user metrics used to derive personalized recommendations.
   * These values are intentionally local for the static prototype.
   */
  const userState = {
    income: 80000,
    diningSpend: 8000,
    creditCardDebt: 150000,
    debtApr: 21.9,
    emergencyFundMonths: 1.4,
    nextBillDays: 5,
    recommendationsProgress: {
      diningCap: 64,
      autopaySafety: 40,
      emergencyBoost: 38,
      aprAttack: 45,
      incomeBuffer: 32,
      dueDateShield: 50,
    },
  };
const healthIndicators = [
  {
    id: 'savingsRate',
    name: 'Норма сбережений',
    value: 68, // индекс от 0 до 100
    percent: 12, // реальный процент от дохода (для расчёта)
    description: 'Доля дохода, которую вы откладываете. Чем выше, тем быстрее растёт резервный фонд и накопления.',
    formula: 'Фактический процент сбережений / 0.3 * 100 (при целевом 30%)',
    improvementSteps: [
      'Поставьте цель откладывать 10% от каждого дохода',
      'Автоматизируйте перевод в сбережения сразу после поступления денег',
      'Сократите необязательные траты (кафе, подписки)'
    ]
  },
  {
    id: 'debtLoad',
    name: 'Долговая нагрузка',
    value: 45,
    percent: 28,
    description: 'Отношение ежемесячных платежей по долгам к доходу. Низкая нагрузка — больше свободы.',
    formula: '100 - min(платежи/доход * 100, 100)',
    improvementSteps: [
      'Платите больше минимального платежа по самому дорогому долгу',
      'Рефинансируйте кредиты под более низкий процент',
      'Избегайте новых долгов'
    ]
  },
  // добавьте остальные показатели по аналогии:
  // стабильность дохода, стабильность расходов, резервный фонд, накопления
  {
    id: 'incomeStability',
    name: 'Стабильность дохода',
    value: 82,
    percent: null, // может не быть процента
    description: 'Насколько предсказуем ваш доход. Высокая стабильность позволяет планировать бюджет.',
    formula: 'Оценивается на основе регулярности поступлений',
    improvementSteps: [
      'Развивайте дополнительные источники дохода',
      'Создайте подушку безопасности на случай потери основного дохода'
    ]
  },
];

  /** @type {Map<string, object>} */
  let recommendationLookup = new Map();

  /** @type {HTMLElement | null} */
  let lastFocusedRecommendationElement = null;

  /** @type {HTMLElement | null} */
  let lastFocusedLevelTrigger = null;

  /** @type {Array<{label: string, amount: number}>} */
  let quickButtons = [
    { label: "Кофе", amount: 200, category: "Еда" },
  { label: "Обед", amount: 300, category: "Еда" },
  { label: "Бабл Ти", amount: 500, category: "Напитки" },
  ];

  function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
  }

  function clampUnit(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }

  function normalizeRange(value, min, max) {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return 0;
    }

    return clampUnit((value - min) / (max - min));
  }

  function inverseNormalizeRange(value, min, max) {
    return 1 - normalizeRange(value, min, max);
  }

  function priorityToBoost(priority) {
    return clampUnit((4 - priority) / 3);
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function formatCurrency(value) {
    const safeValue = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(safeValue);
  }

  function parseNumberField(formData, key) {
    const value = Number(formData.get(key));
    return Number.isFinite(value) ? value : 0;
  }

  function wirePressStates(elements) {
    elements.forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      element.addEventListener("pointerdown", () => {
        element.classList.add("is-pressed");
      });

      const clearPressedState = () => {
        element.classList.remove("is-pressed");
      };

      element.addEventListener("pointerup", clearPressedState);
      element.addEventListener("pointercancel", clearPressedState);
      element.addEventListener("pointerleave", clearPressedState);

      element.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
          element.classList.add("is-pressed");
        }
      });

      element.addEventListener("keyup", clearPressedState);
      element.addEventListener("blur", clearPressedState);
    });
  }

  function runRevealSequence(root = document) {
    const revealNodes = Array.from(root.querySelectorAll(".reveal"));

    revealNodes
      .sort((a, b) => {
        const orderA = Number(a.getAttribute("data-reveal-order") || 0);
        const orderB = Number(b.getAttribute("data-reveal-order") || 0);
        return orderA - orderB;
      })
      .forEach((node, index) => {
        if (prefersReducedMotion()) {
          node.classList.add("is-visible");
          return;
        }

        window.setTimeout(() => {
          node.classList.add("is-visible");
        }, index * REVEAL_DELAY_MS);
      });
  }

  function animateProgressBars(root = document) {
    const bars = root.querySelectorAll(".progress[data-progress]");

    bars.forEach((bar) => {
      const target = clampPercent(Number(bar.getAttribute("data-progress") || 0));
      const fill = bar.querySelector("span");

      if (!fill) {
        return;
      }

      fill.style.width = "0%";

      if (prefersReducedMotion()) {
        fill.style.width = `${target}%`;
        return;
      }

      window.setTimeout(() => {
        fill.style.width = `${target}%`;
      }, 200);
    });
  }

  function animateJarFill() {
    const jarFill = document.querySelector("[data-jar-fill]");

    if (!(jarFill instanceof HTMLElement)) {
      return;
    }

    const target = clampPercent(Number(jarFill.getAttribute("data-jar-fill") || 0));

    if (prefersReducedMotion()) {
      jarFill.style.height = `${target}%`;
      return;
    }

    window.setTimeout(() => {
      jarFill.style.height = `${target}%`;
    }, 280);
  }

  function renderLevelRing(levelValue) {
    const ring = document.querySelector("[data-level-ring]");

    if (!(ring instanceof HTMLElement)) {
      return;
    }

    const safeLevel = clampPercent(levelValue);
    const filledSegments = Math.round((safeLevel / 100) * LEVEL_RING_SEGMENTS);
    const segments = [];

    for (let index = 0; index < LEVEL_RING_SEGMENTS; index += 1) {
      const segment = document.createElement("span");
      segment.className = "ring-segment";
      segment.style.setProperty("--segment-angle", `${(index / LEVEL_RING_SEGMENTS) * 360}deg`);

      if (index < filledSegments) {
        segment.classList.add("is-filled");
      }

      segments.push(segment);
    }

    ring.replaceChildren(...segments);
  }

  function applyFinancialHealthLevel() {
    const levelNode = document.querySelector("[data-financial-health-level]");
    const levelHeading = document.getElementById("financial-level-heading");

    if (levelNode instanceof HTMLElement) {
      levelNode.textContent = String(FINANCIAL_HEALTH_LEVEL);
    }

    if (levelHeading instanceof HTMLElement) {
      levelHeading.textContent = `УРОВЕНЬ ФИНАНСОВОГО ЗДОРОВЬЯ`;
    }

    renderLevelRing(FINANCIAL_HEALTH_LEVEL);
  }

  function buildRecommendation(params) {
    return {
      id: params.id,
      action: params.action,
      impact: params.impact,
      deadline: params.deadline,
      rationale: params.rationale,
      xp: params.xp,
      progress: clampPercent(params.progress),
      priority: params.priority,
      scoreSignals: {
        severity: clampUnit(params.scoreSignals?.severity),
        urgency: clampUnit(params.scoreSignals?.urgency),
        impact: clampUnit(params.scoreSignals?.impact),
        effort: clampUnit(params.scoreSignals?.effort),
      },
    };
  }
function renderIndicators() {
  const container = document.getElementById('indicator-list');
  if (!container) return;

  const cards = healthIndicators.map(indicator => {
    const card = document.createElement('article');
    card.className = 'indicator-card';
    card.dataset.indicatorId = indicator.id;

    // Заголовок с названием и значением
    const header = document.createElement('div');
    header.className = 'indicator-header';

    const name = document.createElement('span');
    name.className = 'indicator-name';
    name.textContent = indicator.name;

    const value = document.createElement('span');
    value.className = 'tag';
    value.textContent = indicator.value;

    header.append(name, value);

    // Кнопка раскрытия (используем существующий дизайн)
    const expandButton = document.createElement('button');
    expandButton.className = 'indicator-row-button';
    expandButton.setAttribute('aria-expanded', 'false');
    expandButton.innerHTML = `
      <div class="indicator-meta">
        <span class="indicator-summary">Индекс ${indicator.value}</span>
        <span class="indicator-chevron">▼</span>
      </div>
    `;

   
    const details = document.createElement('div');
    details.className = 'indicator-expanded';
    details.innerHTML = `
      <div class="indicator-section">
        <p class="indicator-section-title">Значение</p>
        <p class="indicator-section-body">${indicator.description}</p>
      </div>
      
      <div class="indicator-section">
        <p class="indicator-section-title">Как улучшить</p>
        <ul class="improve-list">
          ${indicator.improvementSteps.map(step => `<li>${step}</li>`).join('')}
        </ul>
      </div>
<div class="indicator-section">
        <p class="indicator-section-title">Формула</p>
        <p class="indicator-section-body">${indicator.formula} ${indicator.percent ? `(текущий процент: ${indicator.percent}%)` : ''}</p>
              </div>
      <div class="indicator-section">
        <p class="indicator-section-title">Динамика</p>
        <!-- График будет добавлен позже -->
        <div class="mini-chart" data-indicator-chart="${indicator.id}"></div>
      </div>
    `;

    card.append(header, expandButton, details);
    return card;
  });

  container.replaceChildren(...cards);

  container.querySelectorAll('.indicator-card').forEach(card => {
  const button = card.querySelector('.indicator-row-button');
  const details = card.querySelector('.indicator-expanded');

  button.addEventListener('click', () => {
    const isExpanded = button.getAttribute('aria-expanded') === 'true';

    // Если текущая карточка уже открыта – просто закрываем её
    if (isExpanded) {
      button.setAttribute('aria-expanded', 'false');
      card.classList.remove('is-expanded');
    } else {
      // Закрываем все остальные карточки
      container.querySelectorAll('.indicator-card').forEach(otherCard => {
        const otherButton = otherCard.querySelector('.indicator-row-button');
        otherButton.setAttribute('aria-expanded', 'false');
        otherCard.classList.remove('is-expanded');
      });

      // Открываем текущую
      button.setAttribute('aria-expanded', 'true');
      card.classList.add('is-expanded');
    }
  });
});}

function renderMiniCharts() {
  document.querySelectorAll('[data-indicator-chart]').forEach(container => {
    // Очищаем контейнер
    container.innerHTML = '';

    // Создаём простой SVG 100x30
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 30');
    svg.style.width = '100%';
    svg.style.height = '30px';

    // Генерируем случайные точки для демонстрации
    const points = [];
    for (let x = 0; x <= 100; x += 10) {
      const y = 5 + Math.random() * 20;
      points.push(`${x},${y}`);
    }

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'var(--secondary)');
    polyline.setAttribute('stroke-width', '1.5');

    svg.appendChild(polyline);
    container.appendChild(svg);
  });
}

  function calculateRecommendationScore(item) {
    const severity = clampUnit(item.scoreSignals?.severity);
    const urgency = clampUnit(item.scoreSignals?.urgency);
    const impact = clampUnit(item.scoreSignals?.impact);
    const effortEase = 1 - clampUnit(item.scoreSignals?.effort);
    const priorityBoost = priorityToBoost(item.priority);

    const weightedScore =
      severity * SCORE_WEIGHTS.severity +
      urgency * SCORE_WEIGHTS.urgency +
      impact * SCORE_WEIGHTS.impact +
      effortEase * SCORE_WEIGHTS.effort +
      priorityBoost * SCORE_WEIGHTS.priorityBoost;

    return Math.round(clampUnit(weightedScore) * 100);
  }

  function rankRecommendations(items) {
    return items
      .map((item) => ({
        ...item,
        score: calculateRecommendationScore(item),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        if (b.scoreSignals.urgency !== a.scoreSignals.urgency) {
          return b.scoreSignals.urgency - a.scoreSignals.urgency;
        }

        return b.scoreSignals.severity - a.scoreSignals.severity;
      });
  }

  function deriveRecommendations() {
    const recommendations = [];
    const diningRatio = userState.income > 0 ? userState.diningSpend / userState.income : 0;
    const debtToIncomeRatio = userState.income > 0 ? userState.creditCardDebt / userState.income : 0;
    const aprFactor = userState.debtApr / 100;
    const billUrgency = inverseNormalizeRange(userState.nextBillDays, 0, 21);

    if (diningRatio >= 0.06) {
      const targetReduction = Math.max(30, Math.round(userState.diningSpend * 0.25));
      recommendations.push(
        buildRecommendation({
          id: "diningCap",
          action: `Set dining cap to ${formatCurrency(Math.max(userState.diningSpend - targetReduction, 0))} this month and enforce a weekly ceiling in Input.`,
          impact: `redirect about ${formatCurrency(targetReduction)} per month to savings.`,
          deadline: "start this week and review in 14 days.",
          rationale: "dining spend is above your current stability threshold.",
          xp: 45,
          progress: userState.recommendationsProgress.diningCap,
          priority: 1,
          scoreSignals: {
            severity: normalizeRange(diningRatio, 0.06, 0.16),
            urgency: 0.48,
            impact: normalizeRange(targetReduction, 40, 500),
            effort: 0.52,
          },
        })
      );
    }

    if (userState.creditCardDebt > 0 && userState.debtApr >= 16) {
      const monthlyInterest = Math.round((userState.creditCardDebt * aprFactor) / 12);
      recommendations.push(
        buildRecommendation({
          id: "aprAttack",
          action: `Внесите дополнительные  ${formatCurrency(60)} в счёт погашения баланса с наибольшей процентной ставкой`,
          impact: `снижение процентной нагрузки примерно на ${formatCurrency(Math.round(monthlyInterest * 0.22))}/месяц.`,
          deadline: "выполнить до закрытия следующей выписки",
          rationale: "задолженность с высокой процентной ставкой растёт быстрее, чем текущая скорость её погашения",
          xp: 50,
          progress: userState.recommendationsProgress.aprAttack,
          priority: 1,
          scoreSignals: {
            severity: clampUnit((normalizeRange(userState.debtApr, 16, 30) + normalizeRange(debtToIncomeRatio, 0.2, 1.1)) / 2),
            urgency: clampUnit(0.56 + billUrgency * 0.24),
            impact: normalizeRange(monthlyInterest, 20, 220),
            effort: 0.58,
          },
        })
      );
    }

    if (userState.nextBillDays <= 7) {
      recommendations.push(
        buildRecommendation({
          id: "dueDateShield",
          action: "Включите автоплатёж и напоминание о ручном пополнении карт",
          impact: "избежать риска просрочки и обеспечить стабильность истории платежей",
          deadline: `${Math.max(userState.nextBillDays, 1)} дней`,
          rationale: "приближается дата оплаты счета, и риск несвоевременного платежа повышен",
          xp: 35,
          progress: userState.recommendationsProgress.dueDateShield,
          priority: 1,
          scoreSignals: {
            severity: inverseNormalizeRange(userState.nextBillDays, 0, 10),
            urgency: inverseNormalizeRange(userState.nextBillDays, 0, 14),
            impact: 0.57,
            effort: 0.26,
          },
        })
      );
    }

    if (userState.emergencyFundMonths < 3) {
      const bufferBoost = Math.max(75, Math.round(userState.income * 0.04));
      recommendations.push(
        buildRecommendation({
          id: "emergencyBoost",
          action: `Настройте автоматический перевод ${formatCurrency(bufferBoost)} в резервный фонд сразу после зарплаты.`,
          impact: `сформировать резервный фонд ~${formatCurrency(bufferBoost * 12)} в год`,
          deadline: "до следующего поступления дохода",
          rationale: "текущий запас средств ниже базового уровня финансовой устойчивости в 3 месяца",
          xp: 40,
          progress: userState.recommendationsProgress.emergencyBoost,
          priority: 2,
          scoreSignals: {
            severity: normalizeRange(3 - userState.emergencyFundMonths, 0, 3),
            urgency: 0.46,
            impact: normalizeRange(bufferBoost, 75, 600),
            effort: 0.24,
          },
        })
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        buildRecommendation({
          id: "incomeBuffer",
          action: "Move 5% of variable income to a stability bucket this month.",
          impact: "исключить риск просрочки и обеспечить стабильную историю платежей",
          deadline: "5 дней",
          rationale: "скоро дедлайн по счёту — высокий риск просрочки",
          xp: 30,
          progress: userState.recommendationsProgress.incomeBuffer,
          priority: 3,
          scoreSignals: {
            severity: 0.34,
            urgency: 0.31,
            impact: 0.38,
            effort: 0.22,
          },
        })
      );
    }

    return rankRecommendations(recommendations).slice(0, MAX_RECOMMENDATIONS);
  }

  function createRecommendationCard(item) {
    const card = document.createElement("article");
    card.className = "recommendation-item";
    card.dataset.recommendationId = item.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Open recommendation details: ${item.action}`);

    const head = document.createElement("div");
    head.className = "recommendation-head";

    const title = document.createElement("h3");
    title.className = "recommendation-title";
    title.textContent = item.action;

    const xp = document.createElement("span");
    xp.className = "tag";
    xp.textContent = `+${item.xp} XP`;

    head.append(title, xp);
    card.append(head);

    return card;
  }

  function getRecommendationModalParts() {
    const modal = document.querySelector("[data-recommendation-modal]");

    return {
      modal: modal instanceof HTMLElement ? modal : null,
      title: document.querySelector("[data-recommendation-title]"),
      impact: document.querySelector("[data-recommendation-impact]"),
      deadline: document.querySelector("[data-recommendation-deadline]"),
      rationale: document.querySelector("[data-recommendation-rationale]"),
      xp: document.querySelector("[data-recommendation-xp]"),
      closeButton: document.querySelector(".recommendation-modal .modal-close"),
    };
  }

  function syncBodyModalState() {
    const recommendationModal = document.querySelector("[data-recommendation-modal]");
    const recommendationOpen = recommendationModal instanceof HTMLElement && !recommendationModal.hidden;

    document.body.classList.toggle("is-modal-open", recommendationOpen);
  }

  function setRecommendationDetail(container, label, value) {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const labelNode = document.createElement("span");
    labelNode.className = "detail-label";
    labelNode.textContent = label;

    const valueNode = document.createElement("span");
    valueNode.className = "detail-value";
    valueNode.textContent = value;

    container.replaceChildren(labelNode, document.createTextNode(" "), valueNode);
  }

  function openRecommendationModal(recommendationId) {
    const recommendation = recommendationLookup.get(recommendationId);
    const { modal, title, impact, deadline, rationale, xp, closeButton } = getRecommendationModalParts();

    if (!recommendation || !modal) {
      return;
    }

    if (title instanceof HTMLElement) {
      title.textContent = recommendation.action;
    }

    setRecommendationDetail(impact, "Цель", recommendation.impact);
    setRecommendationDetail(deadline, "Дедлайн", recommendation.deadline);
    setRecommendationDetail(rationale, "Причина", recommendation.rationale);

    if (xp instanceof HTMLElement) {
      xp.textContent = `Награда +${recommendation.xp} XP`;
    }

    lastFocusedRecommendationElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.hidden = false;
    syncBodyModalState();

    if (closeButton instanceof HTMLElement) {
      closeButton.focus();
    }
  }

  function closeRecommendationModal() {
    const { modal } = getRecommendationModalParts();

    if (!modal || modal.hidden) {
      return;
    }

    modal.hidden = true;
    syncBodyModalState();

    if (lastFocusedRecommendationElement instanceof HTMLElement) {
      lastFocusedRecommendationElement.focus();
      lastFocusedRecommendationElement = null;
    }
  }

  function renderRecommendations() {
    const list = document.getElementById("recommendations-list");

    if (!(list instanceof HTMLElement)) {
      return;
    }

    const recommendations = deriveRecommendations();
    recommendationLookup = new Map(recommendations.map((item) => [item.id, item]));
    list.replaceChildren(...recommendations.map(createRecommendationCard));

    wirePressStates(Array.from(list.querySelectorAll(".recommendation-item")));
  }

  function pulseRecommendationCard(card) {
    if (prefersReducedMotion()) {
      return;
    }

    card.classList.remove("is-highlighted");
    void card.offsetWidth;
    card.classList.add("is-highlighted");

    window.setTimeout(() => {
      card.classList.remove("is-highlighted");
    }, 760);
  }

  function updateHomeTopBarVisibility(screenName) {
    const homeTopBar = document.querySelector("[data-home-topbar]");
    const floatingAvatar = document.querySelector("[data-non-home-avatar]");

    if (homeTopBar instanceof HTMLElement) {
      homeTopBar.hidden = screenName !== "Home";
    }

    if (floatingAvatar instanceof HTMLElement) {
      floatingAvatar.hidden = screenName === "Home";
    }
  }

  function wireRecommendationCards() {
    const list = document.getElementById("recommendations-list");
    const modal = document.querySelector("[data-recommendation-modal]");
    const closeTriggers = Array.from(document.querySelectorAll("[data-close-recommendation-modal]"));

    if (!(list instanceof HTMLElement) || !(modal instanceof HTMLElement)) {
      return;
    }

    const openFromElement = (element) => {
      const card = element.closest(".recommendation-item");

      if (!(card instanceof HTMLElement)) {
        return;
      }

      const recommendationId = card.getAttribute("data-recommendation-id");
      if (!recommendationId) {
        return;
      }

      pulseRecommendationCard(card);
      openRecommendationModal(recommendationId);
    };

    list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      openFromElement(target);
    });

    list.addEventListener("keydown", (event) => {
      const isActivationKey = event.key === "Enter" || event.key === " ";
      if (!isActivationKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (!target.closest(".recommendation-item")) {
        return;
      }

      event.preventDefault();
      openFromElement(target);
    });

    closeTriggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        closeRecommendationModal();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeRecommendationModal();
      }
    });
  }

  function showScreen(screenName) {
window.scrollTo({ top: 0, behavior: 'smooth' });
    const allScreens = Array.from(document.querySelectorAll(".screen"));
    const navItems = Array.from(document.querySelectorAll(".bottom-nav .nav-item"));

    allScreens.forEach((screen) => {
      const isTarget = screen.getAttribute("data-screen") === screenName;
      screen.hidden = !isTarget;
      screen.classList.toggle("is-active", isTarget);

      if (isTarget) {
        runRevealSequence(screen);
        animateProgressBars(screen);
      }
    });

    navItems.forEach((item) => {
      const isTarget = item.getAttribute("data-target-screen") === screenName;
      item.classList.toggle("is-active", isTarget);
    });

    updateHomeTopBarVisibility(screenName);
  }

  function wireLevelNavigation() {
    const openTrigger = document.querySelector("[data-open-level-screen]");
    const backTrigger = document.querySelector("[data-back-home]");

    if (openTrigger instanceof HTMLButtonElement) {
      openTrigger.addEventListener("click", () => {
        lastFocusedLevelTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        showScreen("Financial Level");
      });
    }

    if (backTrigger instanceof HTMLButtonElement) {
      backTrigger.addEventListener("click", () => {
        showScreen("Home");

        if (lastFocusedLevelTrigger instanceof HTMLElement) {
          lastFocusedLevelTrigger.focus();
          lastFocusedLevelTrigger = null;
        }
      });
    }
  }

  function wireBottomNavigation() {
    const navItems = Array.from(document.querySelectorAll(".bottom-nav .nav-item"));

    navItems.forEach((item) => {
      item.addEventListener("click", () => {
        navItems.forEach((node) => {
          node.classList.remove("is-tapped");
        });

        const targetScreen = item.getAttribute("data-target-screen") || "Home";
        showScreen(targetScreen);

        if (!prefersReducedMotion()) {
          item.classList.add("is-tapped");
          window.setTimeout(() => {
            item.classList.remove("is-tapped");
          }, 300);
        }
      });
    });
  }

  function spawnJarBurst(jarShell) {
    if (prefersReducedMotion()) {
      return;
    }

    const burst = document.createElement("span");
    burst.className = "jar-burst";

    const x = 30 + Math.random() * 40;
    const y = 28 + Math.random() * 36;

    burst.style.setProperty("--burst-x", `${x}%`);
    burst.style.setProperty("--burst-y", `${y}%`);

    jarShell.appendChild(burst);

    window.setTimeout(() => {
      burst.remove();
    }, 620);

  }

  function wireJarInteractions() {
    const jarShell = document.querySelector(".jar-shell");

    if (!(jarShell instanceof HTMLElement)) {
      return;
    }

    jarShell.addEventListener("click", () => {
      if (!prefersReducedMotion()) {
        jarShell.classList.remove("is-celebrating");
        void jarShell.offsetWidth;
        jarShell.classList.add("is-celebrating");

        spawnJarBurst(jarShell);
        window.setTimeout(() => spawnJarBurst(jarShell), INTERACTION_FEEDBACK_MS);
      }
    });
  }

  function wireProfileAvatar() {
    const avatars = Array.from(document.querySelectorAll("[data-open-profile]"));

    avatars.forEach((avatar) => {
      if (!(avatar instanceof HTMLElement)) {
        return;
      }

      avatar.addEventListener("click", () => {
        if (!prefersReducedMotion()) {
          avatar.classList.remove("is-flash");
          void avatar.offsetWidth;
          avatar.classList.add("is-flash");

          window.setTimeout(() => {
            avatar.classList.remove("is-flash");
          }, 620);
        }

        showScreen("Profile");
      });
    });
  }

  function wireInputForm() {
    const form = document.getElementById("financial-input-form");
    const feedback = document.getElementById("input-feedback");

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const formData = new FormData(form);
      const nextState = {
        income: Math.max(0, parseNumberField(formData, "income")),
        diningSpend: Math.max(0, parseNumberField(formData, "diningSpend")),
        creditCardDebt: Math.max(0, parseNumberField(formData, "creditCardDebt")),
        debtApr: Math.max(0, parseNumberField(formData, "debtApr")),
        emergencyFundMonths: Math.max(0, parseNumberField(formData, "emergencyFundMonths")),
        nextBillDays: Math.max(0, parseNumberField(formData, "nextBillDays")),
      };

      Object.assign(userState, nextState);
      renderRecommendations();
      showScreen("Home");

      if (feedback instanceof HTMLElement) {
        feedback.textContent = "Recommendations recalculated with quantified impact from your latest inputs.";
      }
    });
  }

  function wireInputMethods() {
    const chips = Array.from(document.querySelectorAll(".method-chip"));
    const panels = Array.from(document.querySelectorAll("[data-method-panel]"));

    if (chips.length === 0 || panels.length === 0) {
      return;
    }

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const method = chip.getAttribute("data-method");

        chips.forEach((candidate) => {
          const isActive = candidate === chip;
          candidate.classList.toggle("is-active", isActive);
          candidate.setAttribute("aria-pressed", String(isActive));
        });

        panels.forEach((panel) => {
          const isActive = panel.getAttribute("data-method-panel") === method;
          panel.hidden = !isActive;
        });
      });
    });
  }

  function renderQuickButtons() {
    const container = document.querySelector("[data-quick-buttons]");

    if (!(container instanceof HTMLElement)) {
      return;
    }

    const nodes = quickButtons.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-button";
      button.textContent = `${item.label} • ${formatCurrency(item.amount)} • ${item.category}`;
      button.dataset.quickLabel = item.label;
      button.dataset.quickAmount = String(item.amount);
      return button;
    });

    container.replaceChildren(...nodes);
    wirePressStates(nodes);
  }

  function wireQuickActions() {
    const container = document.querySelector("[data-quick-buttons]");
    const quickForm = document.getElementById("quick-config-form");
    const feedback = document.getElementById("input-feedback");

    if (!(container instanceof HTMLElement) || !(quickForm instanceof HTMLFormElement)) {
      return;
    }

    renderQuickButtons();

    container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest(".quick-button");
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const label = button.dataset.quickLabel || "Quick action";
      const amount = Number(button.dataset.quickAmount || 0);

      if (feedback instanceof HTMLElement) {
        feedback.textContent = `Добавлено ${formatCurrency(amount)} к тратам при помощи кнопки \"${label}\"`;
      }
    });

    quickForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const formData = new FormData(quickForm);
  const label = String(formData.get("quickLabel") || "").trim();
  const amount = Number(formData.get("quickAmount") || 0);
  const category = formData.get("quickCategory"); // значение из select

  if (!label || !Number.isFinite(amount) || amount <= 0 || !category) {
    if (feedback instanceof HTMLElement) {
      feedback.textContent = "Предоставьте корректное заполнение покупки, суммы и категории";
    }
    return;
  }

  quickButtons = [...quickButtons, { label, amount, category }].slice(-8);
  renderQuickButtons();
  quickForm.reset();

  if (feedback instanceof HTMLElement) {
    feedback.textContent = `Quick action "${label}" (${category}) for ${formatCurrency(amount)} added.`;
  }
    });
const customSelect = document.querySelector('.custom-select');
if (customSelect) {
  const button = customSelect.querySelector('.select-button');
  const optionsList = customSelect.querySelector('.select-options');
  const hiddenInput = customSelect.querySelector('input[name="quickCategory"]');

  button.addEventListener('click', () => {
    optionsList.hidden = !optionsList.hidden;
  });

  optionsList.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
      const value = e.target.dataset.value;
      const text = e.target.textContent;
      button.textContent = text;
      hiddenInput.value = value;
      optionsList.hidden = true;

      // Убрать выделение со всех и добавить на выбранный
      optionsList.querySelectorAll('li').forEach(li => li.classList.remove('selected'));
      e.target.classList.add('selected');
    }
  });

  // Закрытие списка при клике вне
  document.addEventListener('click', (e) => {
    if (!customSelect.contains(e.target)) {
      optionsList.hidden = true;
    }
  });
}
  }
  function wireReceiptCapture() {
    const receiptButton = document.querySelector("[data-receipt-capture]");
    const feedback = document.getElementById("input-feedback");

    if (!(receiptButton instanceof HTMLButtonElement)) {
      return;
    }

    receiptButton.addEventListener("click", () => {
      if (feedback instanceof HTMLElement) {
        feedback.textContent = "Чек отсканирован и добавлен в категорию";
      }
    });
  }

  function wireBannerPicker() {
    const banner = document.querySelector("[data-banner]");
    const options = Array.from(document.querySelectorAll(".banner-choice"));

    if (!(banner instanceof HTMLElement) || options.length === 0) {
      return;
    }

    options.forEach((option) => {
      option.addEventListener("click", () => {
        const theme = option.getAttribute("data-banner-theme");
        if (!theme) {
          return;
        }

        banner.className = `profile-banner ${theme}`;

        options.forEach((node) => {
          node.classList.toggle("is-active", node === option);
        });
      });
    });
  }

  function wireFragmentTracks() {
    const tracks = Array.from(document.querySelectorAll(".skill-card-item"));

    tracks.forEach((item) => {
      if (!(item instanceof HTMLElement)) {
        return;
      }

      const fragments = Number(item.getAttribute("data-fragments") || 0);
      const max = Number(item.getAttribute("data-fragments-max") || 10);
      item.style.setProperty("--fragments", String(Math.max(0, fragments)));
      item.style.setProperty("--fragments-max", String(Math.max(1, max)));
    });
  }

  function init() {
    runRevealSequence();
    applyFinancialHealthLevel();
    renderRecommendations();
renderIndicators();
renderMiniCharts();
    animateProgressBars();
    animateJarFill();

    wireRecommendationCards();
    wireLevelNavigation();
    wireBottomNavigation();
    wireJarInteractions();
    wireProfileAvatar();
    wireInputForm();
    wireInputMethods();
    wireQuickActions();
    wireReceiptCapture();
    wireBannerPicker();
    wireFragmentTracks();

    updateHomeTopBarVisibility("Home");
    syncBodyModalState();

    const pressable = Array.from(
      document.querySelectorAll("button, .recommendation-item, .stat-card, .team-member, .skill-card-item")
    );
    wirePressStates(pressable);

const jarHeading = document.getElementById('jar-heading');
if (jarHeading) {
  jarHeading.addEventListener('click', () => {
    showScreen('Skill Cards');
  });
  // Добавим указатель, чтобы было понятно, что элемент кликабельный
  jarHeading.style.cursor = 'pointer';
}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
