import supabase from './supabase.js';

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;

// Глобальные переменные
let currentUser = null;
let userBalance = 0;
let inventoryItems = [];
let casesData = [];

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
        
        if (!currentUser) {
            showNotification('Ошибка загрузки профиля');
            return;
        }
        
        // Обновление UI с данными пользователя
        updateUserUI(currentUser);
        
        // Загрузка баланса
        await loadUserBalance();
        
        // Загрузка инвентаря
        await loadInventory();

        // Инициализация кейсов
        await initCases();

        // Загрузка истории операций
        await loadTransactions();
    }
    
    // Инициализация вкладок
    initTabs();
    
    // Инициализация модальных окон
    initModals();
    
    // Инициализация кнопок
    initButtons();

    // Инициализация рулетки бонусов
    initRoulette();
});

// Функция для получения или создания пользователя
async function getUserOrCreate(tgUser) {
    try {
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
                last_name: tgUser.last_name || '',
                language_code: tgUser.language_code || 'ru',
                is_premium: tgUser.is_premium || false,
                balance: 100, // Начальный баланс
                level: 1,
                experience: 0,
                referrals_count: 0,
                referral_code: generateReferralCode(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (createError) throw createError;
        
        // Создаем первую запись в истории операций
        await supabase
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
    document.getElementById('user-name').textContent = user.first_name || `User ${user.id}`;
    document.getElementById('user-id').textContent = user.id;
    document.getElementById('user-balance').textContent = user.balance;
    document.getElementById('user-balance-stat').textContent = user.balance;
    document.getElementById('user-level-value').textContent = user.level;
    
    // Установка аватара (если есть)
    const avatarImg = document.getElementById('avatar-img');
    if (window.Telegram.WebApp.initDataUnsafe.user?.photo_url) {
        avatarImg.src = window.Telegram.WebApp.initDataUnsafe.user.photo_url;
    } else {
        avatarImg.src = 'https://via.placeholder.com/150';
    }
    
    // Обновление реферальной ссылки
    const botUsername = window.Telegram.WebApp.initDataUnsafe.user?.username || 'your_bot';
    document.getElementById('referral-link').value = `https://t.me/${botUsername}?start=ref_${user.referral_code}`;
    
    // Обновление статистики
    document.getElementById('ref-count').textContent = user.referrals_count || 0;
    document.getElementById('ref-earned').textContent = (user.referrals_count * 50) || 0;
    document.getElementById('ref-count-stat').textContent = user.referrals_count || 0;
    document.getElementById('ref-earned-stat').textContent = (user.referrals_count * 50) || 0;
    
    // Прогресс уровня
    const expNeeded = calculateExpNeeded(user.level);
    const expProgress = (user.experience / expNeeded) * 100;
    document.querySelector('.progress-bar').style.width = `${expProgress}%`;
    document.querySelector('.stat-value').textContent = `${user.experience}/${expNeeded} XP`;
}

// Функция для расчета необходимого опыта для уровня
function calculateExpNeeded(level) {
    return level * 500; // Например, 500 XP для 1 уровня, 1000 для 2 и т.д.
}

// Функция для загрузки баланса пользователя
async function loadUserBalance() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabase
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
        const { data, error } = await supabase
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
        const { error: deleteError } = await supabase
            .from('inventory')
            .delete()
            .eq('id', item.id);
        
        if (deleteError) throw deleteError;
        
        // Добавляем деньги на баланс
        const { error: updateError } = await supabase
            .from('users')
            .update({ balance: userBalance + item.items.price })
            .eq('id', currentUser.id);
        
        if (updateError) throw updateError;
        
        // Добавляем запись в историю операций
        await supabase
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
        const { error } = await supabase
            .from('withdrawals')
            .insert([{
                user_id: currentUser.id,
                item_id: item.item_id,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        // Удаляем предмет из инвентаря
        await supabase
            .from('inventory')
            .delete()
            .eq('id', item.id);
        
        // Добавляем запись в историю операций
        await supabase
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
        const { data, error } = await supabase
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
    
    // Модальное окно информации о шансах
    const chanceModal = document.getElementById('chance-modal');
    const closeChanceModal = document.getElementById('close-chance-modal');
    
    closeChanceModal.addEventListener('click', () => {
        chanceModal.classList.remove('active');
    });
    
    // Модальное окно создания промокода
    const createPromoModal = document.getElementById('create-promo-modal');
    const closeCreatePromoModal = document.getElementById('close-create-promo-modal');
    
    closeCreatePromoModal.addEventListener('click', () => {
        createPromoModal.classList.remove('active');
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
        const selectedAmount = document.querySelector('input[name="deposit-amount"]:checked')?.value;
        if (selectedAmount) {
            processDeposit(parseInt(selectedAmount));
        } else {
            showNotification('Пожалуйста, выберите сумму');
        }
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
        } else {
            showNotification('Пожалуйста, введите промокод');
        }
    });
    
    // Кнопка создания промокода
    document.getElementById('create-promo-btn').addEventListener('click', () => {
        createPromoCode();
    });
    
    // Кнопка "Показать еще" в истории операций
    document.querySelector('.show-more-btn')?.addEventListener('click', async () => {
        await loadMoreTransactions();
    });
    
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
        
        const { data, error } = await supabase
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
        
        const { data: todayBonus, error: bonusError } = await supabase
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
                        const { data: randomItem, error: itemError } = await supabase
                            .from('items')
                            .select('*')
                            .eq('rarity', prizeValue)
                            .limit(1);
                        
                        if (itemError) throw itemError;
                        
                        if (randomItem && randomItem.length > 0) {
                            const item = randomItem[0];
                            await supabase.from('inventory').insert([{
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
                    await supabase
                        .from('users')
                        .update({ balance: userBalance })
                        .eq('id', currentUser.id);
                    
                    document.getElementById('user-balance').textContent = userBalance;
                    document.getElementById('user-balance-stat').textContent = userBalance;
                }
                
                // Записываем получение бонуса
                await supabase.from('daily_bonuses').insert([{
                    user_id: currentUser.id,
                    type: prizeType,
                    value: prizeValue,
                    claimed_at: new Date().toISOString()
                }]);
                
                // Добавляем запись в историю операций
                if (rewardAmount > 0) {
                    await supabase
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
async function processDeposit(amount) {
    if (!currentUser) return;
    
    try {
        // Здесь должна быть логика обработки платежа (например, через платежную систему)
        // Для демонстрации просто добавляем сумму на баланс
        
        const { error } = await supabase
            .from('users')
            .update({ balance: userBalance + amount })
            .eq('id', currentUser.id);
        
        if (error) throw error;
        
        // Добавляем запись в историю операций
        await supabase
            .from('transactions')
            .insert([{
                user_id: currentUser.id,
                type: 'deposit',
                amount: amount,
                description: 'Пополнение баланса',
                created_at: new Date().toISOString()
            }]);
        
        // Обновляем UI
        userBalance += amount;
        document.getElementById('user-balance').textContent = userBalance;
        document.getElementById('user-balance-stat').textContent = userBalance;
        document.getElementById('deposit-modal').classList.remove('active');
        
        showNotification(`💰 Баланс успешно пополнен на ${amount} монет`);
    } catch (error) {
        console.error('Error processing deposit:', error);
        showNotification('Ошибка при пополнении баланса');
    }
}

// Функция для активации промокода
async function applyPromoCode(code) {
    if (!currentUser) return;
    
    try {
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
        
        if (usageError) throw usageError;
        
        if (usage && usage.length > 0) {
            showNotification('Вы уже использовали этот промокод');
            return;
        }
        
        // Добавляем бонус на баланс
        const { error: updateError } = await supabase
            .from('users')
            .update({ balance: userBalance + promo.reward_amount })
            .eq('id', currentUser.id);
        
        if (updateError) throw updateError;
        
        // Записываем использование промокода
        await supabase
            .from('promo_code_usage')
            .insert([{
                user_id: currentUser.id,
                promo_code_id: promo.id,
                used_at: new Date().toISOString()
            }]);
        
        // Добавляем запись в историю операций
        await supabase
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
        
        const { data: recentPromos, error: promosError } = await supabase
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
        // Загружаем кейсы из Supabase
        const { data: cases, error } = await supabase
            .from('cases')
            .select('*')
            .order('price', { ascending: true });
        
        if (error) throw error;
        
        if (cases && cases.length > 0) {
            casesData = cases;
            
            // Добавляем количество предметов для каждого кейса
            const casesWithItems = await Promise.all(cases.map(async caseItem => {
                const { count } = await supabase
                    .from('case_items')
                    .select('*', { count: 'exact' })
                    .eq('case_id', caseItem.id);
                
                return {
                    ...caseItem,
                    items_count: count || 0
                };
            }));
            
            renderCases(casesWithItems);
            initCaseFilters();
            initCaseCategories();
        } else {
            console.log('No cases found in database');
        }
    } catch (error) {
        console.error('Error initializing cases:', error);
        showNotification('Ошибка загрузки кейсов');
    }
}

function initCaseCategories() {
    document.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            // Удаляем активный класс у всех категорий
            document.querySelectorAll('.category-item').forEach(i => {
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

// Функция для отрисовки кейсов
function renderCases(cases, filter = 'all') {
    const container = document.querySelector('.cases-grid');
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
            <div class="case-image" style="background-image: url('${caseItem.image_url}')">
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