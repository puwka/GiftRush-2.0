// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp || {
    initDataUnsafe: {},
    expand: () => console.log('expand'),
    enableClosingConfirmation: () => console.log('enableClosingConfirmation'),
    showAlert: (msg) => alert(msg)
};

// Глобальные переменные
let currentUser = null;
let userBalance = 0;
let inventoryItems = [];
let casesData = [];

// Удалить все import/export и инициализировать supabase глобально
window.supabase = window.supabase || supabase;

// Инициализация приложения
// Обновите код в app.js (в начале функции DOMContentLoaded)
document.addEventListener('DOMContentLoaded', async () => {
    // Показываем экран загрузки
    const loadingScreen = document.getElementById('loading-screen');
    const comingSoonScreen = document.getElementById('coming-soon-screen');
    const appContainer = document.querySelector('.app-container');
    
    // Скрываем все остальные экраны
    comingSoonScreen.style.display = 'none';
    appContainer.style.display = 'none';
    
    // Инициализация Telegram WebApp
    if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.expand();
        window.Telegram.WebApp.enableClosingConfirmation();
    }

    // Проверяем пользователя (если есть)
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser) {
        try {
            currentUser = await getUserOrCreate(tgUser);
            
            // Скрываем экран загрузки с анимацией
            loadingScreen.classList.add('hidden');
            
            if (currentUser?.role === 2) { // Для админов
                appContainer.style.display = 'flex';
                updateUserUI(currentUser);
                await loadUserBalance();
                await loadInventory();
                await initCases();
                await loadTransactions();
                
                // Добавьте эти строки:
                initTabs();
                initModals();
                initButtons();
                initRoulette();
            } else { // Для обычных пользователей
                comingSoonScreen.style.display = 'flex';
                initComingSoonScreen();
            }
        } catch (error) {
            console.error('Initialization error:', error);
            loadingScreen.classList.add('hidden');
            comingSoonScreen.style.display = 'flex';
            initComingSoonScreen();
        }
    } else {
        // Если нет пользователя Telegram
        loadingScreen.classList.add('hidden');
        comingSoonScreen.style.display = 'flex';
        initComingSoonScreen();
    }
    
    // Удаляем экран загрузки после анимации
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 500);
});

function initComingSoonScreen() {
    const content = `
        <div class="logo">
            <i class="fas fa-gift"></i>
            <span>GiftRush</span>
        </div>
        <h1>Скоро запуск!</h1>
        <p>Мы активно работаем над проектом, чтобы сделать его еще лучше для вас.</p>
        <div class="progress-container">
            <div class="progress-bar-open" style="width: 78%"></div>
            <span>78% готово</span>
        </div>
        <div class="features-grid">
                    <div class="feature-card">
                        <div class="feature-icon">
                            <i class="fas fa-box-open"></i>
                        </div>
                        <h3>Уникальные кейсы</h3>
                        <p>Эксклюзивные предметы и награды</p>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <i class="fas fa-coins"></i>
                        </div>
                        <h3>Подарки и бонусы</h3>
                        <p>Выигрывайте и выводите</p>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <h3>Реферальная система</h3>
                        <p>Приглашайте друзей и получайте награды</p>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">
                            <i class="fas fa-trophy"></i>
                        </div>
                        <h3>Достижения</h3>
                        <p>Разблокируйте уникальные награды</p>
                    </div>
                </div>
        <div class="countdown">
            <h3>До запуска осталось:</h3>
            <div class="timer">
                <div class="time-block">
                    <span class="days">07</span>
                    <span class="label">Дней</span>
                </div>
                <div class="time-block">
                    <span class="hours">12</span>
                    <span class="label">Часов</span>
                </div>
                <div class="time-block">
                    <span class="minutes">45</span>
                    <span class="label">Минут</span>
                </div>
            </div>
        </div>
        <div class="tg-channel">
            <p>Подпишитесь на наш Telegram-канал, чтобы быть в курсе новостей:</p>
            <a href="https://t.me/giftrushofficial" class="tg-channel-btn" target="_blank">
                <i class="fab fa-telegram"></i> GiftRush Official
            </a>
        </div>
    `;
    
    document.querySelector('.coming-soon-content').innerHTML = content;
    updateCountdown();
}

// Функция для получения или создания пользователя
async function getUserOrCreate(tgUser) {
    try {
        // Проверяем, есть ли пользователь в БД
        const { data: existingUser, error } = await window.supabase
            .from('users')
            .select('*')
            .eq('telegram_id', tgUser.id)
            .single();
        
        if (existingUser) {
            return existingUser;
        }
        
        // Создаем нового пользователя
        const { data: newUser, error: createError } = await window.supabase
            .from('users')
            .insert([{
                telegram_id: tgUser.id,
                username: tgUser.username || `user_${tgUser.id}`,
                first_name: tgUser.first_name,
                last_name: tgUser.last_name || '',
                language_code: tgUser.language_code || 'ru',
                is_premium: tgUser.is_premium || false,
                balance: 100, // Начальный баланс
                level: 1,
                experience: 0,
                referrals_count: 0,
                referral_code: generateReferralCode(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                role: 1 // По умолчанию обычный пользователь
            }])
            .select()
            .single();
        
        if (createError) throw createError;
        
        // Создаем первую запись в истории операций
        await window.supabase
            .from('transactions')
            .insert([{
                user_id: newUser.id,
                type: 'bonus',
                amount: 100,
                description: 'Начальный бонус',
                created_at: new Date().toISOString()
            }]);
        
        return newUser;
    } catch (error) {
        console.error('Error in getUserOrCreate:', error);
        return null;
    }
}

// Функция для генерации реферального кода
function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Функция для обновления UI с данными пользователя
function updateUserUI(user) {
    if (!user) return;

    // Основная информация
    const userNameElement = document.getElementById('user-name');
    const userBalanceElement = document.getElementById('user-balance');
    const userBalanceStatElement = document.getElementById('user-balance-stat');
    const userLevelValueElement = document.getElementById('user-level-value');
    
    if (userNameElement) userNameElement.textContent = user.first_name || `User ${user.id}`;
    if (userBalanceElement) userBalanceElement.textContent = user.balance;
    if (userBalanceStatElement) userBalanceStatElement.textContent = user.balance;
    if (userLevelValueElement) userLevelValueElement.textContent = user.level;
    
    // Установка аватара (если есть)
    const avatarImg = document.getElementById('avatar-img');
    if (avatarImg) {
        if (window.Telegram.WebApp.initDataUnsafe.user?.photo_url) {
            avatarImg.src = window.Telegram.WebApp.initDataUnsafe.user.photo_url;
        } else {
            avatarImg.src = 'https://via.placeholder.com/150';
        }
    }
    
    // Обновление реферальной ссылки
    const referralLinkElement = document.getElementById('referral-link');
    if (referralLinkElement) {
        const botUsername = window.Telegram.WebApp.initDataUnsafe.user?.username || 'your_bot';
        referralLinkElement.value = `https://t.me/${botUsername}?start=ref_${user.referral_code}`;
    }
    
    // Обновление статистики
    const refCountElement = document.getElementById('ref-count');
    const refEarnedElement = document.getElementById('ref-earned');
    const refCountStatElement = document.getElementById('ref-count-stat');
    const refEarnedStatElement = document.getElementById('ref-earned-stat');
    
    if (refCountElement) refCountElement.textContent = user.referrals_count || 0;
    if (refEarnedElement) refEarnedElement.textContent = (user.referrals_count * 50) || 0;
    if (refCountStatElement) refCountStatElement.textContent = user.referrals_count || 0;
    if (refEarnedStatElement) refEarnedStatElement.textContent = (user.referrals_count * 50) || 0;
    
    // Прогресс уровня
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        const expNeeded = calculateExpNeeded(user.level);
        const expProgress = (user.experience / expNeeded) * 100;
        progressBar.style.width = `${expProgress}%`;
    }
    
    const statValueElement = document.querySelector('.stat-value');
    if (statValueElement) {
        const expNeeded = calculateExpNeeded(user.level);
        statValueElement.textContent = `${user.experience}/${expNeeded} XP`;
    }
}

// Функция для расчета необходимого опыта для уровня
function calculateExpNeeded(level) {
    return level * 500; // Например, 500 XP для 1 уровня, 1000 для 2 и т.д.
}

// Функция для загрузки баланса пользователя
async function loadUserBalance() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await window.supabase
            .from('users')
            .select('balance')
            .eq('id', currentUser.id)
            .single();
        
        if (error) throw error;
        
        if (data) {
            userBalance = data.balance;
            document.getElementById('user-balance').textContent = userBalance;
            document.getElementById('user-balance-stat').textContent = userBalance;
        }
    } catch (error) {
        console.error('Error loading balance:', error);
    }
}

// Функция для загрузки инвентаря
async function loadInventory() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await window.supabase
            .from('inventory')
            .select(`
                id,
                item_id,
                quantity,
                obtained_at,
                items (id, name, image_url, rarity, price, withdrawable)
            `)
            .eq('user_id', currentUser.id);
        
        if (error) throw error;
        
        if (data) {
            inventoryItems = data;
            renderInventoryItems();
        }
    } catch (error) {
        console.error('Error loading inventory:', error);
    }
}

// Функция для отрисовки предметов инвентаря
function renderInventoryItems() {
    const giftsContainer = document.getElementById('gifts-items');
    const bonusContainer = document.getElementById('bonus-items');
    const otherContainer = document.getElementById('other-items');
    
    // Очищаем контейнеры
    giftsContainer.innerHTML = '';
    bonusContainer.innerHTML = '';
    otherContainer.innerHTML = '';
    
    // Если инвентарь пуст
    if (inventoryItems.length === 0) {
        giftsContainer.innerHTML = `
            <div class="empty-inventory">
                <i class="fas fa-box-open"></i>
                <p>Ваш инвентарь пуст</p>
                <button class="btn-primary">Открыть кейс</button>
            </div>
        `;
        return;
    }
    
    // Группируем предметы по типам
    const gifts = [];
    const bonuses = [];
    const other = [];
    
    inventoryItems.forEach(item => {
        // Определяем тип предмета по его свойствам
        if (item.items.price > 100) {
            gifts.push(item);
        } else if (item.items.withdrawable) {
            bonuses.push(item);
        } else {
            other.push(item);
        }
    });
    
    // Рендерим подарки
    if (gifts.length > 0) {
        gifts.forEach(item => {
            const element = createInventoryItemElement(item);
            giftsContainer.appendChild(element);
        });
    } else {
        giftsContainer.innerHTML = `
            <div class="empty-inventory">
                <i class="fas fa-gift"></i>
                <p>Нет подарков</p>
            </div>
        `;
    }
    
    // Рендерим бонусы
    if (bonuses.length > 0) {
        bonuses.forEach(item => {
            const element = createInventoryItemElement(item);
            bonusContainer.appendChild(element);
        });
    } else {
        bonusContainer.innerHTML = `
            <div class="empty-inventory">
                <i class="fas fa-star"></i>
                <p>Нет бонусных предметов</p>
            </div>
        `;
    }
    
    // Рендерим другие предметы
    if (other.length > 0) {
        other.forEach(item => {
            const element = createInventoryItemElement(item);
            otherContainer.appendChild(element);
        });
    } else {
        otherContainer.innerHTML = `
            <div class="empty-inventory">
                <i class="fas fa-archive"></i>
                <p>Здесь пока ничего нет</p>
            </div>
        `;
    }
}

// Создание элемента инвентаря
function createInventoryItemElement(item) {
    const element = document.createElement('div');
    element.className = 'inventory-item';
    element.innerHTML = `
        <img src="${item.items.image_url}" alt="${item.items.name}">
        <div class="item-name">${item.items.name}</div>
        <div class="item-rarity ${item.items.rarity}">${getRarityName(item.items.rarity)}</div>
    `;
    
    element.addEventListener('click', () => {
        openItemModal(item);
    });
    
    return element;
}

// Функция для получения названия редкости
function getRarityName(rarity) {
    const rarities = {
        'common': 'Обычный',
        'uncommon': 'Необычный',
        'rare': 'Редкий',
        'epic': 'Эпический',
        'legendary': 'Легендарный'
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
    rarity.className = 'item-rarity ' + item.items.rarity;
    
    // Обработчики кнопок
    document.getElementById('sell-item-btn').onclick = () => sellItem(item);
    document.getElementById('withdraw-item-btn').onclick = () => withdrawItem(item);
    
    // Показываем или скрываем кнопку вывода в зависимости от возможности вывода
    const withdrawBtn = document.getElementById('withdraw-item-btn');
    withdrawBtn.style.display = item.items.withdrawable ? 'block' : 'none';
    
    modal.classList.add('active');
}

// Функция для продажи предмета
async function sellItem(item) {
    try {
        // Удаляем предмет из инвентаря
        const { error: deleteError } = await window.supabase
            .from('inventory')
            .delete()
            .eq('id', item.id);
        
        if (deleteError) throw deleteError;
        
        // Добавляем деньги на баланс
        const { error: updateError } = await window.supabase
            .from('users')
            .update({ balance: userBalance + item.items.price })
            .eq('id', currentUser.id);
        
        if (updateError) throw updateError;
        
        // Добавляем запись в историю операций
        await window.supabase
            .from('transactions')
            .insert([{
                user_id: currentUser.id,
                type: 'sell',
                amount: item.items.price,
                description: `Продажа предмета: ${item.items.name}`,
                created_at: new Date().toISOString()
            }]);
        
        // Обновляем UI
        userBalance += item.items.price;
        document.getElementById('user-balance').textContent = userBalance;
        document.getElementById('user-balance-stat').textContent = userBalance;
        
        // Перезагружаем инвентарь
        await loadInventory();
        
        // Закрываем модальное окно
        document.getElementById('item-modal').classList.remove('active');
        
        // Показываем уведомление
        showNotification(`Вы продали ${item.items.name} за ${item.items.price} монет`);
    } catch (error) {
        console.error('Error selling item:', error);
        showNotification('Ошибка при продаже предмета');
    }
}

// Функция для вывода предмета
async function withdrawItem(item) {
    try {
        // Проверяем, можно ли вывести предмет
        if (!item.items.withdrawable) {
            showNotification('Этот предмет нельзя вывести');
            return;
        }
        
        // Создаем запрос на вывод
        const { error } = await window.supabase
            .from('withdrawals')
            .insert([{
                user_id: currentUser.id,
                item_id: item.item_id,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        // Удаляем предмет из инвентаря
        await window.supabase
            .from('inventory')
            .delete()
            .eq('id', item.id);
        
        // Добавляем запись в историю операций
        await window.supabase
            .from('transactions')
            .insert([{
                user_id: currentUser.id,
                type: 'withdraw',
                amount: -item.items.price,
                description: `Запрос на вывод: ${item.items.name}`,
                created_at: new Date().toISOString()
            }]);
        
        // Обновляем инвентарь
        await loadInventory();
        
        // Закрываем модальное окно
        document.getElementById('item-modal').classList.remove('active');
        
        // Показываем уведомление
        showNotification(`Запрос на вывод ${item.items.name} отправлен. Мы свяжемся с вами для уточнения деталей.`);
    } catch (error) {
        console.error('Error withdrawing item:', error);
        showNotification('Ошибка при запросе на вывод');
    }
}

// Функция для загрузки истории операций
async function loadTransactions() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await window.supabase
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            renderTransactions(data);
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Функция для отрисовки истории операций
function renderTransactions(transactions) {
    const container = document.querySelector('.operations-list');
    container.innerHTML = '';
    
    transactions.forEach(transaction => {
        const item = document.createElement('div');
        item.className = 'operation-item';
        
        // Определяем иконку и класс в зависимости от типа операции
        let iconClass = '';
        let icon = '';
        let typeText = '';
        
        switch (transaction.type) {
            case 'deposit':
                iconClass = 'deposit';
                icon = 'fa-coins';
                typeText = 'Пополнение баланса';
                break;
            case 'withdraw':
                iconClass = 'withdraw';
                icon = 'fa-wallet';
                typeText = 'Вывод средств';
                break;
            case 'case':
                iconClass = 'case';
                icon = 'fa-box-open';
                typeText = 'Открытие кейса';
                break;
            case 'sell':
                iconClass = 'case';
                icon = 'fa-coins';
                typeText = 'Продажа предмета';
                break;
            case 'bonus':
                iconClass = 'bonus';
                icon = 'fa-gift';
                typeText = 'Бонус';
                break;
            default:
                iconClass = 'other';
                icon = 'fa-exchange-alt';
                typeText = transaction.type;
        }
        
        // Форматируем дату
        const date = new Date(transaction.created_at);
        const formattedDate = date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Определяем класс для суммы
        const amountClass = transaction.amount >= 0 ? 'positive' : 'negative';
        const amountValue = Math.abs(transaction.amount);
        
        item.innerHTML = `
            <div class="operation-icon ${iconClass}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="operation-info">
                <h3>${typeText}</h3>
                <p>${formattedDate}</p>
            </div>
            <div class="operation-amount ${amountClass}">
                ${transaction.amount >= 0 ? '+' : '-'}${amountValue} <i class="fas fa-coins"></i>
            </div>
        `;
        
        container.appendChild(item);
    });
}

// Функция для инициализации вкладок
function initTabs() {
    const tabLinks = document.querySelectorAll('.nav-item');
    const upgradeNotification = document.getElementById('upgrade-notification');

    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            const tabId = link.getAttribute('data-tab');
            
            if (tabId === 'upgrade-tab') {
                // Показываем кастомное уведомление
                upgradeNotification.textContent = 'Раздел в разработке';
                upgradeNotification.classList.add('show');
                setTimeout(() => {
                    upgradeNotification.classList.remove('show');
                }, 3000);
                return;
            }
            
            // Убираем активный класс у всех вкладок
            tabLinks.forEach(l => l.classList.remove('active'));
            // Добавляем активный класс текущей вкладке
            link.classList.add('active');
            
            // Скрываем все содержимое вкладок
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Показываем содержимое текущей вкладки
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
    
    if (addBalanceBtn && depositModal && closeDepositModal) {
        addBalanceBtn.addEventListener('click', () => {
            depositModal.classList.add('active');
            resetDepositForm();
        });
        
        closeDepositModal.addEventListener('click', () => {
            depositModal.classList.remove('active');
        });
    }
    
    initDepositTabs();
    initDepositInputs();
    
    // Модальное окно предмета
    const itemModal = document.getElementById('item-modal');
    const closeItemModal = document.getElementById('close-item-modal');
    
    if (itemModal && closeItemModal) {
        closeItemModal.addEventListener('click', () => {
            itemModal.classList.remove('active');
        });
    }
    
    // Модальное окно информации о шансах
    const chanceModal = document.getElementById('chance-modal');
    const closeChanceModal = document.getElementById('close-chance-modal');
    
    if (chanceModal && closeChanceModal) {
        closeChanceModal.addEventListener('click', () => {
            chanceModal.classList.remove('active');
        });
    }
    
    // Модальное окно создания промокода
    const createPromoModal = document.getElementById('create-promo-modal');
    const closeCreatePromoModal = document.getElementById('close-create-promo-modal');
    const createPromoBtn = document.getElementById('create-promo-btn');
    
    if (createPromoBtn && createPromoModal && closeCreatePromoModal) {
        createPromoBtn.addEventListener('click', () => {
            createPromoModal.classList.add('active');
        });
        
        closeCreatePromoModal.addEventListener('click', () => {
            createPromoModal.classList.remove('active');
        });
    }
    
    // Закрытие модальных окон при клике вне контента
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// Новые функции для работы с формой пополнения
function initDepositTabs() {
    const tabs = document.querySelectorAll('.deposit-tab');
    const tabContents = document.querySelectorAll('.deposit-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // Убираем активный класс у всех вкладок
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Добавляем активный класс текущей вкладке
            tab.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
            
            // Пересчитываем суммы
            calculateDeposit();
        });
    });
}

function initDepositInputs() {
    const depositAmount = document.getElementById('deposit-amount');
    const tonAmount = document.getElementById('ton-amount');
    
    if (depositAmount) {
        depositAmount.addEventListener('input', calculateDeposit);
    }
    
    if (tonAmount) {
        tonAmount.addEventListener('input', calculateDeposit);
    }
    
    const promoBtn = document.getElementById('apply-deposit-promo-btn');
    if (promoBtn) {
        promoBtn.addEventListener('click', () => {
            const promoCode = document.getElementById('deposit-promo').value.trim();
            if (promoCode) {
                applyPromoCode(promoCode).then(valid => {
                    if (valid) {
                        calculateDeposit();
                        showNotification('Промокод применен!');
                    }
                });
            }
        });
    }
}

function calculateDeposit() {
    const activeTab = document.querySelector('.deposit-tab.active').getAttribute('data-tab');
    let amount = 0;
    let bonus = 0;
    
    if (activeTab === 'stars') {
        amount = parseFloat(document.getElementById('deposit-amount').value) || 0;
        // Здесь можно добавить проверку минимальной суммы для Stars
    } else {
        const ton = parseFloat(document.getElementById('ton-amount').value) || 0;
        amount = Math.floor(ton * 100); // Примерный курс: 1 TON = 100 монет
        bonus = Math.floor(amount * 0.2); // 20% бонус за TON
    }
    
    // Обновляем отображаемые значения
    document.getElementById('stars-receive').textContent = amount;
    if (activeTab === 'ton') {
        document.getElementById('ton-bonus').textContent = bonus;
        document.getElementById('ton-receive').textContent = amount + bonus;
    }
    
    // Обновляем итоговую информацию
    document.getElementById('summary-amount').textContent = `${amount} монет`;
    document.getElementById('summary-bonus').textContent = `${bonus} монет`;
    document.getElementById('summary-total').textContent = `${amount + bonus} монет`;
}

function resetDepositForm() {
    document.getElementById('deposit-amount').value = '';
    document.getElementById('ton-amount').value = '';
    document.getElementById('deposit-promo').value = '';
    document.querySelector('.deposit-tab[data-tab="stars"]').click();
    calculateDeposit();
}

// Функция для инициализации кнопок
function initButtons() {
    // Кнопка подтверждения пополнения баланса
    const confirmDepositBtn = document.getElementById('confirm-deposit-btn');
    if (confirmDepositBtn) {
        confirmDepositBtn.addEventListener('click', processDeposit);
    }
    
    // TonConnect TON оплата
    const tonConnectBtn = document.getElementById('tonconnect-btn');
    if (tonConnectBtn) {
        tonConnectBtn.addEventListener('click', async () => {
            const tonAmount = parseFloat(document.getElementById('ton-amount').value);
            if (!tonAmount || tonAmount <= 0) {
                showNotification('Введите сумму в TON');
                return;
            }
            // 1 TON = 1e9 nanoTON
            const nanoTonAmount = Math.floor(tonAmount * 1e9);
            // Инициализация TonConnect
            const tonConnect = new window.TonConnectSDK.TonConnect({
                manifestUrl: 'https://gift-rush-2-0.vercel.app/tonconnect-manifest.json'
            });
            // Подключение кошелька (если не подключен)
            if (!tonConnect.account) {
                await tonConnect.connectWallet();
            }
            // Адрес для получения TON
            const destination = 'UQAthLzScLE9Ks-MhL1oZk2AnMqcs02JEdDTGypNnt-GH6jD'; // TODO: замените на ваш TON-адрес
            // Создание транзакции
            const tx = {
                to: destination,
                value: nanoTonAmount.toString(),
                // text: 'GiftRush пополнение', // можно добавить комментарий
            };
            try {
                await tonConnect.sendTransaction(tx);
                showNotification('Платеж отправлен! Ожидаем подтверждения...');
                // TODO: Реализуйте серверную проверку поступления TON и начисление монет пользователю
            } catch (e) {
                showNotification('Платеж отменён или произошла ошибка');
            }
        });
    }
    
    // Кнопка копирования реферальной ссылки
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            const referralLink = document.getElementById('referral-link');
            referralLink.select();
            document.execCommand('copy');
            showNotification('Ссылка скопирована в буфер обмена');
        });
    }
    
    // Кнопка активации промокода (в разделе бонусов)
    const applyPromoBtn = document.getElementById('apply-promo-btn');
    if (applyPromoBtn) {
        applyPromoBtn.addEventListener('click', () => {
            const promoCode = document.getElementById('promo-input').value.trim();
            if (promoCode) {
                applyPromoCode(promoCode);
            } else {
                showNotification('Пожалуйста, введите промокод');
            }
        });
    }
    
    // Кнопка создания промокода
    const createPromoBtn = document.getElementById('create-promo-btn');
    if (createPromoBtn) {
        createPromoBtn.addEventListener('click', () => {
            document.getElementById('create-promo-modal').classList.add('active');
        });
    }
    
    // Кнопка "Показать еще" в истории операций
    const showMoreBtn = document.querySelector('.show-more-btn');
    if (showMoreBtn) {
        showMoreBtn.addEventListener('click', async () => {
            await loadMoreTransactions();
        });
    }
    
    // Кнопки фильтров инвентаря
    document.querySelectorAll('.inv-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            document.querySelectorAll('.inv-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.inventory-container').forEach(container => {
                container.classList.remove('active');
                if (container.dataset.type === type) {
                    container.classList.add('active');
                }
            });
        });
    });
}

// Функция для загрузки дополнительных операций
async function loadMoreTransactions() {
    if (!currentUser) return;
    
    try {
        const currentCount = document.querySelectorAll('.operation-item').length;
        
        const { data, error } = await window.supabase
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .range(currentCount, currentCount + 4);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            renderAdditionalTransactions(data);
        } else {
            showNotification('Больше операций нет');
        }
    } catch (error) {
        console.error('Error loading more transactions:', error);
    }
}

// Функция для отрисовки дополнительных операций
function renderAdditionalTransactions(transactions) {
    const container = document.querySelector('.operations-list');
    
    transactions.forEach(transaction => {
        const item = document.createElement('div');
        item.className = 'operation-item';
        
        // Определяем иконку и класс в зависимости от типа операции
        let iconClass = '';
        let icon = '';
        let typeText = '';
        
        switch (transaction.type) {
            case 'deposit':
                iconClass = 'deposit';
                icon = 'fa-coins';
                typeText = 'Пополнение баланса';
                break;
            case 'withdraw':
                iconClass = 'withdraw';
                icon = 'fa-wallet';
                typeText = 'Вывод средств';
                break;
            case 'case':
                iconClass = 'case';
                icon = 'fa-box-open';
                typeText = 'Открытие кейса';
                break;
            case 'sell':
                iconClass = 'case';
                icon = 'fa-coins';
                typeText = 'Продажа предмета';
                break;
            case 'bonus':
                iconClass = 'bonus';
                icon = 'fa-gift';
                typeText = 'Бонус';
                break;
            default:
                iconClass = 'other';
                icon = 'fa-exchange-alt';
                typeText = transaction.type;
        }
        
        // Форматируем дату
        const date = new Date(transaction.created_at);
        const formattedDate = date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Определяем класс для суммы
        const amountClass = transaction.amount >= 0 ? 'positive' : 'negative';
        const amountValue = Math.abs(transaction.amount);
        
        item.innerHTML = `
            <div class="operation-icon ${iconClass}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="operation-info">
                <h3>${typeText}</h3>
                <p>${formattedDate}</p>
            </div>
            <div class="operation-amount ${amountClass}">
                ${transaction.amount >= 0 ? '+' : '-'}${amountValue} <i class="fas fa-coins"></i>
            </div>
        `;
        
        container.appendChild(item);
    });
}

// Функция для инициализации рулетки бонусов
function initRoulette() {
    const spinBtn = document.getElementById('spin-roulette-btn');
    if (!spinBtn) return;
    
    spinBtn.addEventListener('click', spinBonusRoulette);
}

// Функция для вращения рулетки бонусов
async function spinBonusRoulette() {
    if (!currentUser) return;
    
    const spinBtn = document.getElementById('spin-roulette-btn');
    if (spinBtn.disabled) return;
    
    try {
        // Проверяем, получал ли пользователь уже бонус сегодня
        const today = new Date().toISOString().split('T')[0];
        
        const { data: todayBonus, error: bonusError } = await window.supabase
            .from('daily_bonuses')
            .select('*')
            .eq('user_id', currentUser.id)
            .gte('claimed_at', `${today}T00:00:00`)
            .lte('claimed_at', `${today}T23:59:59`);
        
        if (bonusError) throw bonusError;
        
        if (todayBonus && todayBonus.length > 0) {
            showNotification('Вы уже получали бонус сегодня. Приходите завтра!');
            return;
        }
        
        spinBtn.disabled = true;
        spinBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Крутим...';
        
        const roulette = document.querySelector('.roulette-wheel');
        const items = document.querySelectorAll('.roulette-item');
        const itemWidth = items[0].offsetWidth;
        
        // Определяем случайный приз
        const prizeIndex = Math.floor(Math.random() * items.length);
        const prizeItem = items[prizeIndex];
        const prizeType = prizeItem.getAttribute('data-type');
        const prizeValue = prizeItem.getAttribute('data-value');
        
        // Добавляем дополнительные обороты
        const extraRotations = 3;
        const totalOffset = -(prizeIndex * itemWidth) - (extraRotations * items.length * itemWidth);
        
        // Сбрасываем анимацию
        roulette.style.transition = 'none';
        roulette.style.transform = `translateX(${totalOffset}px)`;
        
        // Даем время на сброс
        setTimeout(() => {
            const spinDuration = 3000; // 3 секунды
            roulette.style.transition = `transform ${spinDuration/1000}s cubic-bezier(0.17, 0.67, 0.12, 0.99)`;
            roulette.style.transform = `translateX(${-(prizeIndex * itemWidth)}px)`;
            
            // Обработка результата после анимации
            setTimeout(async () => {
                let message = '';
                let rewardAmount = 0;
                
                // Обработка приза
                switch (prizeType) {
                    case 'balance':
                        rewardAmount = parseInt(prizeValue);
                        userBalance += rewardAmount;
                        message = `🎉 Вы выиграли ${rewardAmount} монет!`;
                        break;
                        
                    case 'discount':
                        localStorage.setItem('activeDiscount', prizeValue);
                        message = `🎁 Вы получили скидку ${prizeValue}% на следующий кейс!`;
                        break;
                        
                    case 'item':
                        // Получаем случайный предмет указанной редкости
                        const { data: randomItem, error: itemError } = await window.supabase
                            .from('items')
                            .select('*')
                            .eq('rarity', prizeValue)
                            .limit(1);
                        
                        if (itemError) throw itemError;
                        
                        if (randomItem && randomItem.length > 0) {
                            const item = randomItem[0];
                            await window.supabase.from('inventory').insert([{
                                user_id: currentUser.id,
                                item_id: item.id,
                                obtained_at: new Date().toISOString()
                            }]);
                            
                            message = `🎁 Вы получили ${getRarityName(item.rarity)} предмет: ${item.name}!`;
                            rewardAmount = item.price;
                        }
                        break;
                }
                
                // Обновляем баланс пользователя
                if (rewardAmount > 0) {
                    await window.supabase
                        .from('users')
                        .update({ balance: userBalance })
                        .eq('id', currentUser.id);
                    
                    document.getElementById('user-balance').textContent = userBalance;
                    document.getElementById('user-balance-stat').textContent = userBalance;
                }
                
                // Записываем получение бонуса
                await window.supabase.from('daily_bonuses').insert([{
                    user_id: currentUser.id,
                    type: prizeType,
                    value: prizeValue,
                    claimed_at: new Date().toISOString()
                }]);
                
                // Добавляем запись в историю операций
                if (rewardAmount > 0) {
                    await window.supabase
                        .from('transactions')
                        .insert([{
                            user_id: currentUser.id,
                            type: 'bonus',
                            amount: rewardAmount,
                            description: `Ежедневный бонус: ${message}`,
                            created_at: new Date().toISOString()
                        }]);
                }
                
                // Обновляем инвентарь, если был выигран предмет
                if (prizeType === 'item') {
                    await loadInventory();
                }
                
                spinBtn.disabled = false;
                spinBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Крутить рулетку';
                showNotification(message);
                
                // Добавляем анимацию выигрыша
                prizeItem.classList.add('prize-winner');
                setTimeout(() => {
                    prizeItem.classList.remove('prize-winner');
                }, 2000);
            }, spinDuration + 100);
        }, 10);
    } catch (error) {
        console.error('Error spinning roulette:', error);
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Крутить рулетку';
        showNotification('Ошибка при получении бонуса');
    }
}

// Функция для обработки пополнения баланса
async function processDeposit() {
    const activeTab = document.querySelector('.deposit-tab.active').getAttribute('data-tab');
    const amountInput = activeTab === 'stars' ? 
        document.getElementById('deposit-amount') : 
        document.getElementById('ton-amount');
    
    const amount = parseFloat(amountInput.value);
    
    if (!amount || amount <= 0) {
        showNotification('Введите корректную сумму');
        return;
    }
    
    // Расчет итоговой суммы с учетом бонусов
    let totalAmount = amount;
    if (activeTab === 'ton') {
        totalAmount += Math.floor(amount * 0.2); // 20% бонус
    }
    
    // Здесь должна быть логика обработки платежа
    // Для демонстрации просто добавляем сумму на баланс
    const { error } = await window.supabase
        .from('users')
        .update({ balance: userBalance + totalAmount })
        .eq('id', currentUser.id);
    
    if (error) {
        console.error('Error updating balance:', error);
        showNotification('Ошибка при пополнении баланса');
        return;
    }
    
    userBalance += totalAmount;
    document.getElementById('user-balance').textContent = userBalance;
    document.getElementById('deposit-modal').classList.remove('active');
    
    showNotification(`💰 Баланс успешно пополнен на ${totalAmount} монет`);
    
    // Сбрасываем форму
    resetDepositForm();
}

// Функция для активации промокода
async function applyPromoCode(code) {
    if (!currentUser) return;
    
    try {
        // Проверяем промокод в БД
        const { data: promo, error } = await window.supabase
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
        const { data: usage, error: usageError } = await window.supabase
            .from('promo_code_usage')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('promo_code_id', promo.id);
        
        if (usageError) throw usageError;
        
        if (usage && usage.length > 0) {
            showNotification('Вы уже использовали этот промокод');
            return;
        }
        
        // Добавляем бонус на баланс
        const { error: updateError } = await window.supabase
            .from('users')
            .update({ balance: userBalance + promo.reward_amount })
            .eq('id', currentUser.id);
        
        if (updateError) throw updateError;
        
        // Записываем использование промокода
        await window.supabase
            .from('promo_code_usage')
            .insert([{
                user_id: currentUser.id,
                promo_code_id: promo.id,
                used_at: new Date().toISOString()
            }]);
        
        // Добавляем запись в историю операций
        await window.supabase
            .from('transactions')
            .insert([{
                user_id: currentUser.id,
                type: 'bonus',
                amount: promo.reward_amount,
                description: `Активация промокода: ${promo.code}`,
                created_at: new Date().toISOString()
            }]);
        
        // Обновляем UI
        userBalance += promo.reward_amount;
        document.getElementById('user-balance').textContent = userBalance;
        document.getElementById('user-balance-stat').textContent = userBalance;
        document.getElementById('promo-input').value = '';
        
        showNotification(`🎉 Промокод активирован! Получено ${promo.reward_amount} монет`);
    } catch (error) {
        console.error('Error applying promo code:', error);
        showNotification('Ошибка при активации промокода');
    }
}

// Функция для создания промокода
async function createPromoCode() {
    if (!currentUser) return;
    
    try {
        // Проверяем, может ли пользователь создать промокод (например, по уровню или другим условиям)
        if (currentUser.level < 3) {
            showNotification('Для создания промокода нужен 3 уровень');
            return;
        }
        
        // Проверяем, не создавал ли пользователь уже промокод на этой неделе
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const { data: recentPromos, error: promosError } = await window.supabase
            .from('promo_codes')
            .select('*')
            .eq('creator_id', currentUser.id)
            .gte('created_at', weekAgo.toISOString());
        
        if (promosError) throw promosError;
        
        if (recentPromos && recentPromos.length > 0) {
            showNotification('Вы уже создавали промокод на этой неделе. Попробуйте позже.');
            return;
        }
        
        // Генерируем промокод
        const promoCode = generatePromoCode();
        const rewardAmount = 50; // Стандартная награда
        
        // Создаем промокод в БД
        const { data, error } = await window.supabase
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
        
        if (error) throw error;
        
        // Показываем уведомление
        const notification = document.getElementById('save-notification');
        notification.textContent = `Промокод создан: ${promoCode}`;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
        
        // Закрываем модальное окно
        document.getElementById('create-promo-modal').classList.remove('active');
        
        showNotification(`🎁 Ваш промокод создан: ${promoCode}\n\nНаграда: ${rewardAmount} монет\n\nПоделитесь им с друзьями!`);
    } catch (error) {
        console.error('Error creating promo code:', error);
        showNotification('Ошибка при создании промокода');
    }
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

// Функция для инициализации кейсов
async function initCases() {
    try {
        console.log("Начало загрузки кейсов...");
        
        // Показываем индикатор загрузки
        const container = document.querySelector('.cases-container');
        container.innerHTML = `
            <div class="case-loading">
                <div class="loading-spinner"></div>
                <p>Загрузка кейсов...</p>
            </div>
        `;

        // 1. Сначала загружаем кейсы
        const { data: cases, error: casesError } = await window.supabase
            .from('cases')
            .select(`
                id,
                name,
                description,
                image_url,
                price,
                rarity,
                created_at,
                discount,
                popularity
            `)
            .order('price', { ascending: true });

        if (casesError) throw casesError;

        if (!cases || cases.length === 0) {
            console.warn("В базе данных нет кейсов");
            container.innerHTML = `
                <div class="empty-inventory" style="grid-column: 1 / -1;">
                    <i class="fas fa-box-open"></i>
                    <p>Кейсы не найдены в базе данных</p>
                </div>
            `;
            return;
        }

        // 2. Затем для каждого кейса загружаем количество предметов
        const casesWithItems = await Promise.all(cases.map(async (caseItem) => {
            const { count: itemsCount, error: countError } = await window.supabase
                .from('case_items')
                .select('*', { count: 'exact', head: true })
                .eq('case_id', caseItem.id);

            if (countError) {
                console.error(`Error counting items for case ${caseItem.id}:`, countError);
                return { ...caseItem, items_count: 0 };
            }

            return { ...caseItem, items_count: itemsCount || 0 };
        }));

        console.log("Кейсы с количеством предметов:", casesWithItems);

        // 3. Сохраняем данные и обновляем UI
        casesData = casesWithItems;
        renderCases(casesWithItems);
        initCaseFilters();
        initCaseCategories();

        // 4. Обновляем баннер с акцией
        updatePromoBanner();

    } catch (error) {
        console.error("Ошибка при загрузке кейсов:", error);
        
        const container = document.querySelector('.cases-container');
        container.innerHTML = `
            <div class="empty-inventory" style="grid-column: 1 / -1;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ошибка загрузки кейсов</p>
                <small>${error.message}</small>
            </div>
        `;
        
        showNotification('Ошибка загрузки кейсов. Пожалуйста, попробуйте позже.');
    }
}

// Функция для обновления баннера с акцией
function updatePromoBanner() {
    const banner = document.querySelector('.case-banner');
    const bannerContent = document.querySelector('.banner-content h3');
    const bannerDesc = document.querySelector('.banner-content p');
    const bannerImage = document.querySelector('.banner-image');
    
    // Берем первый кейс с максимальной скидкой или просто первый кейс
    const promoCase = casesData.find(c => c.discount > 0) || casesData[0];
    
    if (!promoCase) return;
    
    bannerContent.textContent = promoCase.name;
    bannerDesc.textContent = promoCase.description || 'Ограниченная коллекция с эксклюзивными предметами';
    
    if (promoCase.image_url) {
        bannerImage.style.backgroundImage = `url('${promoCase.image_url}')`;
    }
    
    banner.className = 'case-banner';
    banner.classList.add(promoCase.rarity);
}

// Функция для запуска таймера акции
function startPromoTimer(endTime) {
    const timerElement = document.querySelector('.timer-value');
    if (!timerElement || !endTime) return;
    
    const endDate = new Date(endTime).getTime();
    
    const timer = setInterval(() => {
        const now = new Date().getTime();
        const distance = endDate - now;
        
        if (distance < 0) {
            clearInterval(timer);
            timerElement.textContent = 'Акция завершена';
            return;
        }
        
        // Вычисляем оставшееся время
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        // Отображаем время
        timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function initCaseCategories() {
    document.querySelectorAll('.category-card').forEach(item => {
        item.addEventListener('click', () => {
            // Удаляем активный класс у всех категорий
            document.querySelectorAll('.category-card').forEach(i => {
                i.classList.remove('active');
            });
            
            // Добавляем активный класс текущей категории
            item.classList.add('active');
            
            const category = item.dataset.category;
            filterCasesByCategory(category);
        });
    });
}

// Функция для фильтрации кейсов по категории
function filterCasesByCategory(category) {
    let filteredCases = [...casesData];
    
    switch (category) {
        case 'popular':
            filteredCases.sort((a, b) => b.popularity - a.popularity);
            break;
        case 'new':
            filteredCases = filteredCases.filter(c => {
                const caseDate = new Date(c.created_at);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return caseDate > weekAgo;
            });
            break;
        case 'discount':
            filteredCases = filteredCases.filter(c => c.discount > 0);
            break;
        case 'premium':
            filteredCases = filteredCases.filter(c => c.rarity === 'epic' || c.rarity === 'legendary');
            break;
    }
    
    renderCases(filteredCases);
}

function renderCases(cases, filter = 'all') {
    const container = document.querySelector('.cases-container');
    container.innerHTML = '';
    
    const filteredCases = filter === 'all' 
        ? cases 
        : cases.filter(c => c.rarity === filter);
    
    if (filteredCases.length === 0) {
        container.innerHTML = `
            <div class="empty-inventory" style="grid-column: 1 / -1;">
                <i class="fas fa-box-open"></i>
                <p>Кейсы не найдены</p>
            </div>
        `;
        return;
    }
    
    filteredCases.forEach(caseItem => {
        const caseElement = document.createElement('div');
        caseElement.className = 'case-card';
        caseElement.setAttribute('data-case-id', caseItem.id);
        caseElement.setAttribute('data-rarity', caseItem.rarity);
        
        // Добавляем класс "new-case" для новых кейсов (например, добавленных в последние 3 дня)
        const isNew = new Date() - new Date(caseItem.created_at) < 3 * 24 * 60 * 60 * 1000;
        if (isNew) caseElement.classList.add('new-case');
        
        caseElement.innerHTML = `
            <div class="case-image" style="background-image: url('${caseItem.image_url || 'https://via.placeholder.com/150'}')">
                <div class="case-badge">${caseItem.items_count} items</div>
                <div class="case-rarity ${caseItem.rarity}">
                    ${getRarityName(caseItem.rarity)}
                </div>
            </div>
            <div class="case-info">
                <div class="case-name">${caseItem.name}</div>
                <div class="case-price">
                    <div class="price-value">
                        ${caseItem.price} <i class="fas fa-coins"></i>
                    </div>
                    <div class="items-count">${caseItem.items_count} items</div>
                </div>
            </div>
        `;
        
        caseElement.addEventListener('click', () => {
            openCasePage(caseItem.id);
        });
        
        container.appendChild(caseElement);
    });
}

// Функция для инициализации фильтров кейсов
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
            renderCases(casesData, filter);
        });
    });
}

// Функция для открытия страницы с кейсом
function openCasePage(caseId) {
    // Проверяем активную скидку
    const discount = localStorage.getItem('activeDiscount');
    if (discount) {
        showNotification(`У вас активна скидка ${discount}% на этот кейс!`);
        localStorage.removeItem('activeDiscount');
    }
    
    // Сохраняем ID кейса для использования на странице case.html
    localStorage.setItem('selectedCaseId', caseId);
    
    // Перенаправляем на страницу кейса
    window.location.href = 'case.html';
}

// Функция для обновления таймера
function updateCountdown() {
    // Установите дату запуска проекта (например, через 7 дней)
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() + 7);
    
    const timer = setInterval(() => {
        const now = new Date();
        const distance = launchDate - now;
        
        if (distance < 0) {
            clearInterval(timer);
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        
        const daysElement = document.querySelector('.days');
        const hoursElement = document.querySelector('.hours');
        const minutesElement = document.querySelector('.minutes');
        
        if (daysElement) daysElement.textContent = days.toString().padStart(2, '0');
        if (hoursElement) hoursElement.textContent = hours.toString().padStart(2, '0');
        if (minutesElement) minutesElement.textContent = minutes.toString().padStart(2, '0');
    }, 1000);
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