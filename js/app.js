import supabase from './supabase.js';

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;

// Глобальные переменные
let currentUser = null;
let userBalance = 0;
let inventoryItems = [];

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация Telegram WebApp
    tg.expand();
    tg.enableClosingConfirmation();
    
    // Получение данных пользователя из Telegram
    const tgUser = tg.initDataUnsafe?.user;
    
    if (tgUser) {
        // Проверка или создание пользователя в БД
        currentUser = await getUserOrCreate(tgUser);
        
        // Обновление UI с данными пользователя
        updateUserUI(currentUser);
        
        // Загрузка баланса
        loadUserBalance();
        
        // Загрузка инвентаря
        loadInventory();

        await initCases();
    }
    
    // Инициализация вкладок
    initTabs();
    
    // Инициализация модальных окон
    initModals();
    
    // Инициализация кнопок
    initButtons();
    
    // Инициализация кейсов
    initCases();
});

// Функция для получения или создания пользователя
async function getUserOrCreate(tgUser) {
    // Проверяем, есть ли пользователь в БД
    const { data: existingUser, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', tgUser.id)
        .single();
    
    if (existingUser) {
        return existingUser;
    }
    
    // Создаем нового пользователя
    const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{
            telegram_id: tgUser.id,
            username: tgUser.username || `user_${tgUser.id}`,
            first_name: tgUser.first_name,
            last_name: tgUser.last_name,
            language_code: tgUser.language_code,
            is_premium: tgUser.is_premium || false,
            balance: 0,
            level: 1,
            experience: 0,
            referrals_count: 0,
            referral_code: generateReferralCode(),
            created_at: new Date().toISOString()
        }])
        .select()
        .single();
    
    if (createError) {
        console.error('Error creating user:', createError);
        return null;
    }
    
    return newUser;
}

// Функция для генерации реферального кода
function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Функция для обновления UI с данными пользователя
function updateUserUI(user) {
    document.getElementById('user-name').textContent = user.first_name || `User ${user.id}`;
    document.getElementById('user-id').textContent = user.id;
    
    // Установка аватара (если есть)
    if (window.Telegram.WebApp.initDataUnsafe.user?.photo_url) {
        document.getElementById('avatar-img').src = window.Telegram.WebApp.initDataUnsafe.user.photo_url;
    }
    
    // Обновление реферальной ссылки
    document.getElementById('referral-link').value = `https://t.me/YOUR_BOT_USERNAME?start=ref_${user.referral_code}`;
}

// Функция для загрузки баланса пользователя
async function loadUserBalance() {
    if (!currentUser) return;
    
    const { data, error } = await supabase
        .from('users')
        .select('balance')
        .eq('id', currentUser.id)
        .single();
    
    if (data) {
        userBalance = data.balance;
        document.getElementById('user-balance').textContent = userBalance;
    }
}

function renderCases(cases, filter = 'all') {
    const container = document.querySelector('.cases-container');
    container.innerHTML = '';
    
    const filteredCases = filter === 'all' 
        ? cases 
        : cases.filter(c => c.rarity === filter);
    
    filteredCases.forEach(caseItem => {
        const caseElement = document.createElement('div');
        caseElement.className = 'case-card';
        caseElement.setAttribute('data-case-id', caseItem.id);
        caseElement.setAttribute('data-rarity', caseItem.rarity);
        
        caseElement.innerHTML = `
            <div class="case-image" style="background-image: url('${caseItem.image_url}')">
                <div class="case-rarity ${caseItem.rarity}">
                    ${getRarityName(caseItem.rarity)}
                </div>
            </div>
            <div class="case-info">
                <h3>${caseItem.name}</h3>
                <div class="case-price">
                    <span class="case-price-value">
                        ${caseItem.price} <i class="fas fa-coins"></i>
                    </span>
                    <span class="case-items-count">
                        ${getRandomItemsCount()} items
                    </span>
                </div>
            </div>
        `;
        
        caseElement.addEventListener('click', () => {
            openCasePage(caseItem.id);
        });
        
        container.appendChild(caseElement);
    });
}

function initCaseFilters() {
    const filterButtons = document.querySelectorAll('.case-filters .filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Удаляем активный класс у всех кнопок
            filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Добавляем активный класс текущей кнопке
            button.classList.add('active');
            
            // Получаем фильтр
            const filter = button.getAttribute('data-filter');
            
            // Перерисовываем кейсы
            const allCases = Array.from(document.querySelectorAll('.case-card'))
                .map(el => ({
                    id: el.getAttribute('data-case-id'),
                    rarity: el.getAttribute('data-rarity'),
                    // Другие данные можно получить из data-атрибутов или перезапросить
                }));
            
            renderCases(allCases, filter);
        });
    });
}

// Функция для загрузки инвентаря
async function loadInventory() {
    if (!currentUser) return;
    
    const { data, error } = await supabase
        .from('inventory')
        .select(`
            id,
            item_id,
            quantity,
            items (id, name, image_url, rarity, price)
        `)
        .eq('user_id', currentUser.id);
    
    if (data) {
        inventoryItems = data;
        renderInventoryItems();
    }
}

// Функция для отрисовки предметов инвентаря
function renderInventoryItems(filter = 'all') {
    const inventoryContainer = document.getElementById('inventory-items');
    inventoryContainer.innerHTML = '';
    
    let filteredItems = inventoryItems;
    
    if (filter !== 'all') {
        filteredItems = inventoryItems.filter(item => item.items.rarity === filter);
    }
    
    filteredItems.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'inventory-item';
        itemElement.innerHTML = `
            <img src="${item.items.image_url}" alt="${item.items.name}">
            <div class="item-name">${item.items.name}</div>
            <div class="item-price">${item.items.price} <i class="fas fa-coins"></i></div>
            <div class="item-rarity ${'rarity-' + item.items.rarity}">${getRarityName(item.items.rarity)}</div>
        `;
        itemElement.addEventListener('click', () => openItemModal(item));
        inventoryContainer.appendChild(itemElement);
    });
}

function getRandomItemsCount() {
    const counts = [12, 15, 20, 24, 30];
    return counts[Math.floor(Math.random() * counts.length)];
}

// Обновим функцию getRarityName (добавим сокращенные варианты)
function getRarityName(rarity) {
    const rarities = {
        'common': 'Common',
        'uncommon': 'Uncommon',
        'rare': 'Rare',
        'epic': 'Epic',
        'legendary': 'Legendary'
    };
    return rarities[rarity] || rarity;
}

// Функция для открытия модального окна предмета
function openItemModal(item) {
    const modal = document.getElementById('item-modal');
    const title = document.getElementById('item-modal-title');
    const image = document.getElementById('item-modal-image');
    const description = document.getElementById('item-modal-description');
    const price = document.getElementById('item-modal-price');
    const rarity = document.getElementById('item-modal-rarity');
    
    title.textContent = item.items.name;
    image.src = item.items.image_url;
    description.textContent = `Качество: ${getRarityName(item.items.rarity)}`;
    price.textContent = item.items.price;
    rarity.textContent = getRarityName(item.items.rarity);
    rarity.className = 'item-rarity ' + 'rarity-' + item.items.rarity;
    
    // Обработчики кнопок
    document.getElementById('sell-item-btn').onclick = () => sellItem(item);
    document.getElementById('withdraw-item-btn').onclick = () => withdrawItem(item);
    
    modal.classList.add('active');
}

// Функция для продажи предмета
async function sellItem(item) {
    // Удаляем предмет из инвентаря
    const { error: deleteError } = await supabase
        .from('inventory')
        .delete()
        .eq('id', item.id);
    
    if (deleteError) {
        console.error('Error selling item:', deleteError);
        return;
    }
    
    // Добавляем деньги на баланс
    const { error: updateError } = await supabase
        .from('users')
        .update({ balance: userBalance + item.items.price })
        .eq('id', currentUser.id);
    
    if (updateError) {
        console.error('Error updating balance:', updateError);
        return;
    }
    
    // Обновляем UI
    userBalance += item.items.price;
    document.getElementById('user-balance').textContent = userBalance;
    loadInventory();
    
    // Закрываем модальное окно
    document.getElementById('item-modal').classList.remove('active');
    
    // Показываем уведомление
    showNotification(`Вы продали ${item.items.name} за ${item.items.price} монет`);
}

// Функция для вывода предмета
async function withdrawItem(item) {
    // Здесь должна быть логика вывода предмета (например, через Telegram бота)
    showNotification('Функция вывода предмета в разработке');
}

// Функция для инициализации вкладок
function initTabs() {
    const tabLinks = document.querySelectorAll('.nav-item');
    
    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Удаляем активный класс у всех вкладок
            tabLinks.forEach(l => l.classList.remove('active'));
            
            // Добавляем активный класс текущей вкладке
            link.classList.add('active');
            
            // Скрываем все содержимое вкладок
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Показываем содержимое текущей вкладки
            const tabId = link.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Функция для инициализации модальных окон
function initModals() {
    // Модальное окно пополнения баланса
    const depositModal = document.getElementById('deposit-modal');
    const addBalanceBtn = document.getElementById('add-balance-btn');
    const closeDepositModal = document.getElementById('close-deposit-modal');
    
    addBalanceBtn.addEventListener('click', () => {
        depositModal.classList.add('active');
    });
    
    closeDepositModal.addEventListener('click', () => {
        depositModal.classList.remove('active');
    });
    
    // Модальное окно предмета
    const itemModal = document.getElementById('item-modal');
    const closeItemModal = document.getElementById('close-item-modal');
    
    closeItemModal.addEventListener('click', () => {
        itemModal.classList.remove('active');
    });
    
    // Закрытие модальных окон при клике вне контента
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// Функция для инициализации кнопок
function initButtons() {
    // Кнопка подтверждения пополнения баланса
    document.getElementById('confirm-deposit-btn').addEventListener('click', () => {
        const selectedAmount = document.querySelector('input[name="deposit-amount"]:checked').value;
        processDeposit(parseInt(selectedAmount));
    });
    
    // Кнопка копирования реферальной ссылки
    document.getElementById('copy-link-btn').addEventListener('click', () => {
        const referralLink = document.getElementById('referral-link');
        referralLink.select();
        document.execCommand('copy');
        showNotification('Ссылка скопирована в буфер обмена');
    });
    
    // Кнопка активации промокода
    document.getElementById('apply-promo-btn').addEventListener('click', () => {
        const promoCode = document.getElementById('promo-input').value.trim();
        if (promoCode) {
            applyPromoCode(promoCode);
        }
    });
    
    // Кнопка создания промокода
    document.getElementById('create-promo-btn').addEventListener('click', () => {
        createPromoCode();
    });
    
    // Кнопка получения бонуса
    document.getElementById('claim-bonus-btn').addEventListener('click', () => {
        claimDailyBonus();
    });
}

// Функция для обработки пополнения баланса
async function processDeposit(amount) {
    // Здесь должна быть логика обработки платежа (например, через платежную систему)
    // Для демонстрации просто добавляем сумму на баланс
    
    const { error } = await supabase
        .from('users')
        .update({ balance: userBalance + amount })
        .eq('id', currentUser.id);
    
    if (error) {
        console.error('Error updating balance:', error);
        showNotification('Ошибка при пополнении баланса');
        return;
    }
    
    userBalance += amount;
    document.getElementById('user-balance').textContent = userBalance;
    document.getElementById('deposit-modal').classList.remove('active');
    
    showNotification(`Баланс успешно пополнен на ${amount} монет`);
}

// Функция для активации промокода
async function applyPromoCode(code) {
    // Проверяем промокод в БД
    const { data: promo, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .single();
    
    if (error || !promo) {
        showNotification('Промокод не найден или уже использован');
        return;
    }
    
    // Проверяем, не использовал ли пользователь уже этот промокод
    const { data: usage, error: usageError } = await supabase
        .from('promo_code_usage')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('promo_code_id', promo.id);
    
    if (usage && usage.length > 0) {
        showNotification('Вы уже использовали этот промокод');
        return;
    }
    
    // Добавляем бонус на баланс
    const { error: updateError } = await supabase
        .from('users')
        .update({ balance: userBalance + promo.reward_amount })
        .eq('id', currentUser.id);
    
    if (updateError) {
        console.error('Error updating balance:', updateError);
        showNotification('Ошибка при применении промокода');
        return;
    }
    
    // Записываем использование промокода
    await supabase
        .from('promo_code_usage')
        .insert([{
            user_id: currentUser.id,
            promo_code_id: promo.id,
            used_at: new Date().toISOString()
        }]);
    
    // Обновляем UI
    userBalance += promo.reward_amount;
    document.getElementById('user-balance').textContent = userBalance;
    document.getElementById('promo-input').value = '';
    
    showNotification(`Промокод активирован! Получено ${promo.reward_amount} монет`);
}

// Функция для создания промокода
async function createPromoCode() {
    if (!currentUser) return;
    
    // Проверяем, может ли пользователь создать промокод (например, по уровню или другим условиям)
    if (currentUser.level < 3) {
        showNotification('Для создания промокода нужен 3 уровень');
        return;
    }
    
    // Генерируем промокод
    const promoCode = generatePromoCode();
    const rewardAmount = 50; // Стандартная награда
    
    // Создаем промокод в БД
    const { data, error } = await supabase
        .from('promo_codes')
        .insert([{
            code: promoCode,
            creator_id: currentUser.id,
            reward_amount: rewardAmount,
            created_at: new Date().toISOString(),
            is_active: true
        }])
        .select()
        .single();
    
    if (error) {
        console.error('Error creating promo code:', error);
        showNotification('Ошибка при создании промокода');
        return;
    }
    
    showNotification(`Ваш промокод создан: ${promoCode}\n\nНаграда: ${rewardAmount} монет\n\nПоделитесь им с друзьями!`);
}

// Функция для генерации промокода
function generatePromoCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Функция для получения ежедневного бонуса
async function claimDailyBonus() {
    if (!currentUser) return;
    
    // Проверяем, когда пользователь последний раз получал бонус
    const today = new Date().toISOString().split('T')[0];
    const { data: lastBonus, error } = await supabase
        .from('daily_bonuses')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('claimed_at', { ascending: false })
        .limit(1)
        .single();
    
    if (lastBonus && lastBonus.claimed_at.split('T')[0] === today) {
        showNotification('Вы уже получали бонус сегодня');
        return;
    }
    
    // Определяем размер бонуса (можно сделать прогрессию по дням)
    const bonusAmount = 50; // Базовый бонус
    
    // Добавляем бонус на баланс
    const { error: updateError } = await supabase
        .from('users')
        .update({ balance: userBalance + bonusAmount })
        .eq('id', currentUser.id);
    
    if (updateError) {
        console.error('Error updating balance:', updateError);
        showNotification('Ошибка при получении бонуса');
        return;
    }
    
    // Записываем получение бонуса
    await supabase
        .from('daily_bonuses')
        .insert([{
            user_id: currentUser.id,
            amount: bonusAmount,
            claimed_at: new Date().toISOString()
        }]);
    
    // Обновляем UI
    userBalance += bonusAmount;
    document.getElementById('user-balance').textContent = userBalance;
    
    showNotification(`Ежедневный бонус получен! +${bonusAmount} монет`);
}

// Функция для инициализации кейсов
async function initCases() {
    // Загружаем кейсы из Supabase
    const { data: cases, error } = await supabase
        .from('cases')
        .select('*')
        .order('price', { ascending: true });
    
    if (cases) {
        renderCases(cases);
        initCaseFilters();
    }
}

// Функция для открытия страницы с кейсом
function openCasePage(caseId) {
    // Сохраняем ID кейса для использования на странице case.html
    localStorage.setItem('selectedCaseId', caseId);
    window.location.href = 'case.html';
}

// Функция для показа уведомлений
function showNotification(message) {
    // Можно использовать Telegram WebApp для показа уведомлений
    if (tg.showAlert) {
        tg.showAlert(message);
    } else {
        // Fallback для браузера
        alert(message);
    }
}