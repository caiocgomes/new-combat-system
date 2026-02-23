Hooks.once("ready", () => {
  console.log("⚡ Thunderstruck! Sistema de som de crítico carregado");

  // ========================================
  // CONFIGURAÇÃO - EDITE AQUI
  // ========================================
  const CONFIG_THUNDERSTRUCK = {
    // Nome do personagem que tem a arma de trovão
    playerName: "Jerinos",

    // Nome da arma que dispara o efeito
    // Exemplo: "Martelo de Trovão", "Lança Relampejante", etc.
    weaponName: "+1 Mace of thunder",

    // Caminho do arquivo de áudio (relativo à pasta do módulo)
    // Exemplo: "sounds/thunderstruck.mp3"
    audioPath: "sounds/thunderstruck.mp3",

    // Volume do som (0.0 a 1.0)
    volume: 0.7
  };

  // ========================================
  // LÓGICA - NÃO PRECISA MEXER AQUI
  // ========================================

  // Hook para interceptar rolagens de ataque
  Hooks.on("dnd5e.rollAttack", (item, roll) => {
    // Verifica se foi crítico
    if (!roll.isCritical) return;

    const actor = item.actor;
    if (!actor) return;

    // Verifica se é o jogador configurado
    if (actor.name !== CONFIG_THUNDERSTRUCK.playerName) return;

    // Verifica se é a arma configurada
    if (item.name !== CONFIG_THUNDERSTRUCK.weaponName) return;

    console.log(`⚡⚡⚡ THUNDERSTRUCK! ${actor.name} acertou crítico com ${item.name}! ⚡⚡⚡`);
    playThunderstruck();
  });

  function playThunderstruck() {
    const audioPath = CONFIG_THUNDERSTRUCK.audioPath;
    const volume = CONFIG_THUNDERSTRUCK.volume;

    // Tenta tocar o áudio
    try {
      AudioHelper.play({
        src: audioPath,
        volume: volume,
        autoplay: true,
        loop: false
      }, true); // true = toca para todos os jogadores

      // Mensagem no chat (opcional, mas divertido)
      ChatMessage.create({
        content: `<div style="text-align: center; font-size: 20px; color: #FFD700;">
          ⚡⚡⚡ <strong>THUNDERSTRUCK!</strong> ⚡⚡⚡
        </div>`,
        whisper: [] // Envia para todos
      });

    } catch (error) {
      console.error("Erro ao tocar Thunderstruck:", error);
      ui.notifications.warn("Não foi possível tocar o som de Thunderstruck. Verifique o caminho do arquivo.");
    }
  }
});
