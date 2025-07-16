// Aguarda o carregamento completo do DOM antes de executar o script
document.addEventListener('DOMContentLoaded', function () {
    // Apenas inicialize o socket se o usuário estiver logado (o ID do usuário está disponível)
    if (typeof userId !== 'undefined' && userId) {
        // Inicializa o socket.io
        const socket = io();

        // Envia o ID do usuário para o servidor para entrar em sua sala privada
        socket.on('connect', () => {
            socket.emit('join', userId);
        });

        // Ouve por novas solicitações de amizade recebidas
        socket.on('nova_solicitacao', (data) => {
            alert(data.message);
            // Opcional: Adicionar uma notificação mais sofisticada no DOM
        });
        
        // Ouve por solicitações de amizade aceitas
        socket.on('solicitacao_aceita', (data) => {
            alert(data.message);
            // Opcional: Recarregar a página de amigos ou atualizar a lista dinamicamente
            if (window.location.pathname.includes('/amizades')) {
                window.location.reload();
            }
        });

        // Ouve por amizades removidas
        socket.on('amizade_removida', (data) => {
            alert(data.message);
            // Se estiver na página de amizades, recarrega para atualizar a lista
            if (window.location.pathname.includes('/amizades')) {
                window.location.reload();
            }
        });
        
        // Ouve por novos compartilhamentos (álbuns ou imagens)
        socket.on('novo_compartilhamento', (data) => {
            alert(data.message);
            // Opcional: Atualizar a contagem de notificações ou a página de compartilhados
            if (window.location.pathname.includes('/compartilhados')) {
                window.location.reload();
            }
        });
    }
});