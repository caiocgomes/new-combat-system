// Ported to Foundry 14 and dnd5e 6: attacks now live on activities, not items.
Hooks.once("init", () => {
  game.settings.register("new-combat-system", "filterByRange", {
    name: "Filter targets by weapon range",
    hint: "Only show targets within weapon range in the target selection dialog. Targets beyond normal range but within long range are marked with disadvantage.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // Botão de dano na mensagem de resultado
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const btn of html.querySelectorAll(".damage-roll-btn")) {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const { actorId, itemId, activityId, critical } = btn.dataset;
        const item = game.actors.get(actorId)?.items.get(itemId);
        if (!item) {
          ui.notifications.warn("Arma não encontrada para rolar dano.");
          return;
        }
        const activity = item.system.activities?.get(activityId)
          ?? item.system.activities?.getByType("attack")?.[0];
        if (!activity?.rollDamage) {
          ui.notifications.warn("Ataque não encontrado para rolar dano.");
          return;
        }
        const garenDamageBonus = Number(btn.dataset.damageBonus) || 0;
        try {
          await activity.rollDamage({ event, isCritical: critical === "true", garenDamageBonus });
        } catch (err) {
          console.error("[new-combat-system] A rolagem de dano falhou:", err);
          ui.notifications.error(`Rolagem de dano falhou: ${err?.message ?? err}. Detalhes no console (F12).`);
        }
      });
    }
  });

  // Soma o modificador de dano da forma de ataque à primeira parte do dano, para que
  // ele herde o tipo de dano da arma. Esse hook roda em toda rolagem de dano do mundo;
  // só age quando a rolagem veio do botão "Rolar Dano" do nosso card.
  Hooks.on("dnd5e.preRollDamageV2", (config) => {
    const bonus = config.garenDamageBonus;
    if (!Number.isFinite(bonus) || bonus === 0) return;
    const firstRoll = config.rolls?.[0];
    if (!firstRoll) return;
    firstRoll.parts = [...(firstRoll.parts ?? []), String(bonus)];
  });
});

Hooks.once("ready", () => {
  console.log("Custom Defense Bonus system with button loaded");

  if (!game?.modules?.get("lib-wrapper")?.active) {
    ui.notifications.warn(
      "The 'libWrapper' module is required for Custom Defense Bonus to function correctly."
    );
    return;
  }

  // Formas de ataque do PDF "Novos sistemas de Garen" (v1.6). Os modificadores são
  // múltiplos da Proficiência de quem ataca. O bônus de Defesa do Defensivo não é
  // guardado: o card só lembra a mesa de somá-lo no próximo ataque sofrido.
  const ATTACK_FORMS = {
    normal: { name: "Normal", title: "Ataque Normal" },
    ofensivo: { name: "Ofensivo", title: "Ataque Ofensivo" },
    defensivo: { name: "Defensivo", title: "Ataque Defensivo" },
    preciso: { name: "Preciso", title: "Ataque Preciso" },
    determinado: { name: "Determinado", title: "Ataque Total Determinado" },
    violento: { name: "Violento", title: "Ataque Total Violento" },
  };

  function getFormModifiers(form, prof) {
    switch (form) {
      case "ofensivo": return { attack: -prof, damage: prof + 1, defense: 0 };
      case "defensivo": return { attack: -prof, damage: 0, defense: prof };
      case "preciso": return { attack: prof, damage: -(prof + 1), defense: 0 };
      case "determinado": return { attack: prof, damage: 0, defense: 0 };
      case "violento": return { attack: 0, damage: prof, defense: 0 };
      default: return { attack: 0, damage: 0, defense: 0 };
    }
  }

  // Sinal de menos tipográfico, que leitores de tela leem como "menos".
  function signed(value) {
    return value < 0 ? `−${-value}` : `+${value}`;
  }

  function describeModifiers(mods, separator = ", ") {
    const parts = [];
    if (mods.attack) parts.push(`${signed(mods.attack)} ataque`);
    if (mods.damage) parts.push(`${signed(mods.damage)} dano`);
    if (mods.defense) parts.push(`${signed(mods.defense)} defesa`);
    return parts.join(separator);
  }

  // Centros dos quadrados ocupados pelo token. getOccupiedGridSpaceOffsets repete
  // cada quadrado por nível de profundidade, por isso a deduplicação em i,j.
  function getOccupiedPoints(token) {
    const cells = new Map();
    for (const offset of token.document.getOccupiedGridSpaceOffsets()) {
      const key = `${offset.i},${offset.j}`;
      if (cells.has(key)) continue;
      const { x, y } = canvas.grid.getCenterPoint(offset);
      cells.set(key, { x, y });
    }
    return cells.size ? [...cells.values()] : [token.center];
  }

  // Distância entre os quadrados mais próximos, para que tokens grandes possam ser
  // atacados a partir da borda. Medir de centro a centro exigia estar sobre o alvo.
  function getGridDistance(tokenA, tokenB) {
    let min = Infinity;
    for (const a of getOccupiedPoints(tokenA)) {
      for (const b of getOccupiedPoints(tokenB)) {
        min = Math.min(min, canvas.grid.measurePath([a, b]).distance);
      }
    }
    return min;
  }

  function getAttackRange(activity) {
    const weapon = activity.item.system.range ?? {};
    const own = activity.range ?? {};
    // Armas guardam alcance no item, a não ser que a atividade o substitua; magias usam a atividade
    const source = activity.item.type === "weapon" && !own.override ? weapon : own;
    const reach = weapon.reach || own.reach || 0;
    const normal = source.value || reach || 5;
    const long = source.long && source.long > normal ? source.long : null;
    return { normal: Math.max(normal, reach), long };
  }

  function buildTargetDialogContent(combatants, withForms) {
    const radios = combatants
      .map((c, i) => {
        const distLabel = `(${Math.round(c.distance)}ft)`;
        const disadvLabel = c.disadvantage ? ' <span style="color:#e74c3c; font-weight:bold;">⚠️ desvantagem</span>' : "";
        return `<label style="display:block; margin:4px 0; cursor:pointer;">
            <input type="radio" name="target" value="${c.tokenId}" ${i === 0 ? "checked" : ""}/>
            ${foundry.utils.escapeHTML(c.name)} <span style="opacity:0.7">${distLabel}</span>${disadvLabel}
          </label>`;
      })
      .join("");
    const formsHint = withForms
      ? `<p style="margin-top:8px;"><strong>Escolha o tipo de ataque.</strong> Determinado e Violento são Ataque Total (3 pontos de ação).</p>`
      : "";
    return `<p><strong>Escolha o alvo:</strong></p>${radios}${formsHint}`;
  }

  function getSelectedTarget(button) {
    return button.form.elements.target?.value
      ?? button.form.querySelector('input[name="target"]:checked')?.value ?? null;
  }

  // Botões do diálogo. Magias só têm o ataque normal, porque as formas de conjuração
  // do PDF são outras. Armas e ataques naturais ganham as seis formas: quatro na
  // primeira linha (ataque) e duas na segunda (Ataque Total), mais Cancelar.
  function buildAttackButtons(withForms, prof) {
    const cancel = {
      action: "cancel",
      icon: "fa-solid fa-xmark",
      label: "Cancelar",
      callback: () => null,
    };
    if (!withForms) {
      return [
        {
          action: "normal",
          icon: "fa-solid fa-crosshairs",
          label: "Atacar",
          default: true,
          callback: (event, button) => ({ tokenId: getSelectedTarget(button), form: "normal" }),
        },
        cancel,
      ];
    }
    // Um efeito por linha no rótulo; alignSelf iguala a altura dos botões da mesma linha.
    const buttonStyle = (basis) => ({
      flex: `1 1 ${basis}`, alignSelf: "stretch", height: "auto", padding: "0.25rem 0.5rem", textAlign: "center",
    });
    const formButton = (form, basis) => {
      const effect = describeModifiers(getFormModifiers(form, prof), "\n");
      return {
        action: form,
        label: effect ? `${ATTACK_FORMS[form].name}\n${effect}` : ATTACK_FORMS[form].name,
        default: form === "normal",
        style: buttonStyle(basis),
        callback: (event, button) => ({ tokenId: getSelectedTarget(button), form }),
      };
    };
    return [
      formButton("normal", "22%"),
      formButton("ofensivo", "22%"),
      formButton("defensivo", "22%"),
      formButton("preciso", "22%"),
      formButton("determinado", "30%"),
      formButton("violento", "30%"),
      { ...cancel, style: buttonStyle("30%") },
    ];
  }

  // Fluxo completo de um ataque, chamado com this = atividade de ataque.
  async function runAttack(wrapped, args) {
    console.log("[new-combat-system] Ataque de", this.actor?.name, "com", this.item?.name);

    // Sem encounter ativo ou sem cena: ataque segue normalmente
    if (!game.combat || !canvas?.ready) {
      return wrapped(...args);
    }

    // Identifica o token do atacante
    const attackerToken =
      canvas.tokens.controlled[0] ||
      canvas.tokens.placeables.find((t) => t.actor?.id === this.actor.id);

    const filterByRange = game.settings.get("new-combat-system", "filterByRange");
    const attackRange = getAttackRange(this);
    const maxRange = attackRange.long || attackRange.normal;

    // Coleta combatentes válidos (exclui o atacante, exige token no canvas)
    let validCombatants = game.combat.combatants
      .filter((c) => {
        const token = canvas.tokens.get(c.tokenId);
        if (!token) return false;
        if (attackerToken && token.id === attackerToken.id) return false;
        return true;
      })
      .map((c) => {
        const token = canvas.tokens.get(c.tokenId);
        const distance = attackerToken ? getGridDistance(attackerToken, token) : 0;
        const disadvantage = attackRange.long ? distance > attackRange.normal && distance <= attackRange.long : false;
        return { tokenId: c.tokenId, name: c.name, distance, disadvantage };
      });

    if (filterByRange && attackerToken) {
      validCombatants = validCombatants.filter((c) => c.distance <= maxRange);
    }

    if (validCombatants.length === 0) {
      ui.notifications.warn(filterByRange ? "Nenhum alvo ao alcance." : "Nenhum alvo disponível no combate.");
      return null;
    }

    // Dialog de seleção de alvo e tipo de ataque
    const withForms = this.item.type !== "spell";
    const prof = Number(this.actor.system.attributes?.prof) || 0;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: "Escolha o Alvo" },
      position: withForms ? { width: 520 } : {},
      content: buildTargetDialogContent(validCombatants, withForms),
      buttons: buildAttackButtons(withForms, prof),
      rejectClose: false,
    });

    // Cancelou ou fechou: não ataca
    const selectedTokenId = choice?.tokenId;
    if (!selectedTokenId) return null;
    const form = ATTACK_FORMS[choice.form] ? choice.form : "normal";
    const mods = getFormModifiers(form, prof);
    console.log("[new-combat-system] Alvo", selectedTokenId, "forma", form, mods);

    // Modificador de ataque da forma entra na primeira rolagem configurada. args[0]
    // pode chegar indefinido (clique na ficha) ou com { event } (botão do card).
    if (mods.attack) {
      const config = args[0] ?? {};
      const [first = {}, ...rest] = config.rolls ?? [];
      args[0] = {
        ...config,
        rolls: [{ ...first, parts: [String(mods.attack), ...(first.parts ?? [])] }, ...rest],
      };
    }

    // Executa o ataque
    const attackRolls = await wrapped(...args);
    console.log("[new-combat-system] dnd5e devolveu", attackRolls?.length ?? 0, "rolagem(ns) de ataque");

    // Sem rolagem: a janela de rolagem do dnd5e foi fechada ou outro módulo cancelou
    const attackRoll = attackRolls?.[0];
    if (!attackRoll) {
      ui.notifications.info("Ataque sem rolagem: a janela de rolagem do dnd5e foi fechada ou outro módulo cancelou o ataque.");
      return attackRolls ?? null;
    }

    // Rola defesa automaticamente
    const targetToken = canvas.tokens.get(selectedTokenId);
    if (!targetToken?.actor) {
      ui.notifications.warn("Alvo não encontrado no mapa: a defesa não foi rolada.");
      return attackRolls;
    }

    const targetActor = targetToken.actor;
    const defenseBonus = targetActor.system.attributes.ac.value - 10;
    const defenseRoll = await new Roll(`1d20 + ${defenseBonus}`).evaluate();

    // Compara resultado. Empate é do defensor, pelas regras de Garen: o ataque só
    // acerta se superar a defesa.
    const hit = attackRoll.total > defenseRoll.total;
    const resultText = hit ? "✅ O ataque <strong>ACERTOU</strong>!" : "❌ O ataque <strong>ERROU</strong>!";

    // Mensagem unificada com resultado e botão de dano
    const attackerName = foundry.utils.escapeHTML(this.actor.name);
    const targetName = foundry.utils.escapeHTML(targetActor.name);
    let formLine = "";
    if (form !== "normal") {
      const effect = describeModifiers({ ...mods, defense: 0 });
      formLine = `<p>🗡️ ${ATTACK_FORMS[form].title}${effect ? ` (${effect})` : ""}</p>`;
      if (mods.defense) {
        formLine += `<p>🛡️ Some <strong>${signed(mods.defense)}</strong> na Defesa de ${attackerName} contra o próximo ataque sofrido.</p>`;
      }
    }
    const content = `
      <div style="border:1px solid #999; border-radius:6px; padding:8px; margin:4px 0;">
        <p><strong>⚔️ ${attackerName} atacou ${targetName}!</strong></p>
        ${formLine}
        <p>🎲 Ataque: <strong>${attackRoll.total}</strong> <span style="opacity:0.7">(${attackRoll.formula})</span></p>
        <p>🛡️ Defesa: <strong>${defenseRoll.total}</strong> <span style="opacity:0.7">(1d20 + ${defenseBonus})</span></p>
        <p>${resultText}</p>
        <button type="button" class="damage-roll-btn" data-actor-id="${this.actor.id}" data-item-id="${this.item.id}" data-activity-id="${this.id}" data-critical="${attackRoll.isCritical === true}" data-damage-bonus="${mods.damage}">🎲 Rolar Dano</button>
      </div>
    `;

    await ChatMessage.create({
      author: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
    });

    return attackRolls;
  }

  // Wrapper do ataque. O dnd5e chama rollAttack depois de usar a arma sem esperar o
  // resultado nem tratar erro, então uma exceção aqui ficaria só no console. O
  // try/catch leva o erro para a tela, para a mesa saber que o ataque falhou.
  libWrapper.register(
    "new-combat-system",
    "CONFIG.DND5E.activityTypes.attack.documentClass.prototype.rollAttack",
    async function (wrapped, ...args) {
      try {
        return await runAttack.call(this, wrapped, args);
      } catch (err) {
        console.error("[new-combat-system] O ataque falhou:", err);
        ui.notifications.error(`Ataque falhou: ${err?.message ?? err}. Detalhes no console (F12).`);
        return null;
      }
    },
    "MIXED"
  );
});
