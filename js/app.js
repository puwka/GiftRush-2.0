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

        // Инициализация кейсов
        await initCases();
    }
    
    // Инициализация вкладок
    initTabs();
    
    // Инициализация модальных окон
    initModals();
    
    // Инициализация кнопок
    initButtons();
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
            balance: 100, // Начальный баланс
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
    
    // Обновление статистики
    document.getElementById('ref-count').textContent = user.referrals_count || 0;
    document.getElementById('ref-earned').textContent = (user.referrals_count * 50) || 0; // 50 USDT за каждого реферала
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
    // Проверяем, можно ли вывести предмет
    if (!item.items.withdrawable) {
        showNotification('Этот предмет нельзя вывести');
        return;
    }
    
    // Здесь должна быть логика вывода через Telegram бота
    showNotification(`Запрос на вывод ${item.items.name} отправлен. Мы свяжемся с вами для уточнения деталей.`);
    
    // Можно добавить запись в таблицу выводов
    const { error } = await supabase
        .from('withdrawals')
        .insert([{
            user_id: currentUser.id,
            item_id: item.item_id,
            status: 'pending',
            created_at: new Date().toISOString()
        }]);
    
    if (!error) {
        // Удаляем предмет из инвентаря после запроса на вывод
        await supabase
            .from('inventory')
            .delete()
            .eq('id', item.id);
        
        loadInventory();
    }
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
    
    // Кнопка вращения рулетки бонусов
    document.getElementById('spin-roulette-btn').addEventListener('click', spinBonusRoulette);
}

// Функция для вращения рулетки бонусов
async function spinBonusRoulette() {
    if (!currentUser) return;
    
    // Проверяем, получал ли пользователь бонус сегодня
    const today = new Date().toISOString().split('T')[0];
    const { data: lastBonus, error } = await supabase
        .from('daily_bonuses')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('claimed_at', { ascending: false })
        .limit(1)
        .single();
    
    if (lastBonus && lastBonus.claimed_at.split('T')[0] === today) {
        showNotification('Вы уже получали бонус сегодня. Приходите завтра!');
        return;
    }
    
    const spinBtn = document.getElementById('spin-roulette-btn');
    spinBtn.disabled = true;
    spinBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Крутим...';
    
    const roulette = document.querySelector('.roulette-wheel');
    const items = document.querySelectorAll('.roulette-item');
    const itemWidth = items[0].offsetWidth;
    
    // Определяем случайный приз (индекс от 0 до 5)
    const prizeIndex = Math.floor(Math.random() * 6);
    // Смещение, чтобы выбранный элемент оказался в центре
    const offset = - (prizeIndex * itemWidth) + (roulette.offsetWidth / 2 - itemWidth / 2);
    
    // Добавляем дополнительные обороты для эффекта
    const extraRotations = 3;
    const totalOffset = offset - (extraRotations * 6 * itemWidth);
    
    // Сбрасываем анимацию
    roulette.style.transition = 'none';
    roulette.style.transform = `translateX(${-extraRotations * 6 * itemWidth}px)`;
    
    // Даем браузеру время применить сброс
    setTimeout(() => {
        roulette.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        roulette.style.transform = `translateX(${offset}px)`;
    }, 10);
    
    // После завершения анимации
    setTimeout(async () => {
        const prize = items[prizeIndex];
        const prizeType = prize.getAttribute('data-type');
        const prizeValue = prize.getAttribute('data-value');
        
        let message = '';
        
        // Обрабатываем выигрыш
        switch (prizeType) {
            case 'balance':
                const amount = parseInt(prizeValue);
                const { error: balanceError } = await supabase
                    .from('users')
                    .update({ balance: userBalance + amount })
                    .eq('id', currentUser.id);
                
                if (!balanceError) {
                    userBalance += amount;
                    document.getElementById('user-balance').textContent = userBalance;
                    message = `🎉 Вы выиграли ${amount} монет!`;
                }
                break;
                
            case 'discount':
                // Сохраняем скидку для следующего кейса
                localStorage.setItem('activeDiscount', prizeValue);
                message = `🎁 Вы получили скидку ${prizeValue}% на следующий кейс!`;
                break;
                
            case 'item':
                // Добавляем предмет в инвентарь
                const itemRarity = prizeValue;
                const { data: randomItem, error: itemError } = await supabase
                    .from('items')
                    .select('*')
                    .eq('rarity', itemRarity)
                    .limit(1);
                
                if (randomItem && randomItem.length > 0) {
                    const { error: inventoryError } = await supabase
                        .from('inventory')
                        .insert([{
                            user_id: currentUser.id,
                            item_id: randomItem[0].id,
                            obtained_at: new Date().toISOString()
                        }]);
                    
                    if (!inventoryError) {
                        message = `🎁 Вы получили ${getRarityName(itemRarity)} предмет: ${randomItem[0].name}!`;
                        await loadInventory();
                    }
                }
                break;
        }
        
        // Записываем получение бонуса
        await supabase
            .from('daily_bonuses')
            .insert([{
                user_id: currentUser.id,
                type: prizeType,
                value: prizeValue,
                claimed_at: new Date().toISOString()
            }]);
        
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Крутить рулетку';
        showNotification(message);
    }, 3100);
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
    
    showNotification(`💰 Баланс успешно пополнен на ${amount} монет`);
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
    
    showNotification(`🎉 Промокод активирован! Получено ${promo.reward_amount} монет`);
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
    
    showNotification(`🎁 Ваш промокод создан: ${promoCode}\n\nНаграда: ${rewardAmount} монет\n\nПоделитесь им с друзьями!`);
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
    // Загружаем кейсы из Supabase
    const { data: cases, error } = await supabase
        .from('cases')
        .select('*')
        .order('price', { ascending: true });
    
    if (error) {
        console.error('Error loading cases:', error);
        return;
    }
    
    if (cases && cases.length > 0) {
        renderCases(cases);
        initCaseFilters();
    } else {
        console.log('No cases found in database');
    }
}

// Функция для отрисовки кейсов
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
                        ${getRandomItemsCount()} предметов
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
            const allCases = Array.from(document.querySelectorAll('.case-card'))
                .map(el => ({
                    id: el.getAttribute('data-case-id'),
                    rarity: el.getAttribute('data-rarity'),
                    name: el.querySelector('h3').textContent,
                    price: parseInt(el.querySelector('.case-price-value').textContent),
                    image_url: el.querySelector('.case-image').style.backgroundImage.slice(5, -2)
                }));
            
            renderCases(allCases, filter);
        });
    });
}

// Функция для получения случайного количества предметов в кейсе
function getRandomItemsCount() {
    const counts = [12, 15, 20, 24, 30];
    return counts[Math.floor(Math.random() * counts.length)];
}

// Функция для открытия страницы с кейсом
function openCasePage(caseId) {
    // Проверяем активную скидку
    const discount = localStorage.getItem('activeDiscount');
    if (discount) {
        showNotification(`У вас активна скидка ${discount}% на этот кейс!`);
    }
    
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