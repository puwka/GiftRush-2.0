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
// Обновленная функция отрисовки инвентаря
function renderInventoryItems() {
    const giftsContainer = document.getElementById('gifts-items');
    const bonusContainer = document.getElementById('bonus-items');
    
    giftsContainer.innerHTML = '';
    bonusContainer.innerHTML = '';

    inventoryItems.forEach(item => {
        const element = document.createElement('div');
        element.className = `inventory-item ${item.type}`;
        element.innerHTML = `
            <div class="item-badge ${item.type}-badge">${item.type === 'gift' ? '🎁' : '🎉'}</div>
            <img src="${item.image}" alt="${item.name}">
            <div class="item-name">${item.name}</div>
        `;
        
        if(item.type === 'gift') giftsContainer.appendChild(element);
        else bonusContainer.appendChild(element);
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
    const upgradeNotification = document.getElementById('upgrade-notification');

    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            const tabId = link.getAttribute('data-tab');
            
            if (tabId === 'upgrade-tab') {
                // Показываем кастомное уведомление
                upgradeNotification.classList.add('show');
                setTimeout(() => {
                    upgradeNotification.classList.remove('show');
                }, 3000);
                return;
            }
            
            // Остальной код без изменений
            tabLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
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

    // Добавьте в функцию initButtons()
    document.querySelectorAll('.info-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const prizeItem = icon.closest('.prize-item');
            const prizeName = prizeItem.querySelector('span').textContent;
            const prizeChance = prizeItem.getAttribute('data-chance');
            
            document.getElementById('chance-info-content').innerHTML = `
                <div class="chance-item">
                    <span>${prizeName}</span>
                    <span class="chance-value">${prizeChance}</span>
                </div>
                <!-- Добавьте другие призы аналогично -->
            `;
            
            document.getElementById('chance-modal').classList.add('active');
        });
    });

    // Добавьте закрытие модального окна
    document.getElementById('close-chance-modal').addEventListener('click', () => {
        document.getElementById('chance-modal').classList.remove('active');
    });

    // Инициализация модального окна создания промокода
    document.getElementById('create-promo-btn').addEventListener('click', () => {
        document.getElementById('create-promo-modal').classList.add('active');
    });

    document.getElementById('close-create-promo-modal').addEventListener('click', () => {
        document.getElementById('create-promo-modal').classList.remove('active');
    });

    // Обработчик сохранения промокода
    document.getElementById('save-promo-btn').addEventListener('click', () => {
        const promoCode = document.getElementById('promo-code-input').value.trim();
        
        if(promoCode.length < 4) {
            showNotification('Промокод должен содержать минимум 4 символа');
            return;
        }
        
        // Здесь должна быть логика сохранения промокода
        console.log('Создан промокод:', promoCode);
        
        // Показываем уведомление
        const notification = document.getElementById('save-notification');
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 2000);
        
        // Закрываем модалку и очищаем поле
        document.getElementById('create-promo-modal').classList.remove('active');
        document.getElementById('promo-code-input').value = '';
    });

    document.querySelectorAll('.inv-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            document.querySelectorAll('.inv-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.inventory-container').forEach(container => {
                container.classList.remove('active');
                if(container.dataset.type === type) container.classList.add('active');
            });
        });
    });
}

// Функция для вращения рулетки бонусов
async function spinBonusRoulette() {
    if (!currentUser) return;
    
    const spinBtn = document.getElementById('spin-roulette-btn');
    if (spinBtn.disabled) return;
    
    spinBtn.disabled = true;
    spinBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Крутим...';
    
    const roulette = document.querySelector('.roulette-wheel');
    const items = document.querySelectorAll('.roulette-item');
    const itemWidth = items[0].offsetWidth;
    
    // Определяем случайный приз
    const prizeIndex = Math.floor(Math.random() * items.length);
    const spinDuration = 3000; // 3 секунды
    
    // Добавляем дополнительные обороты
    const extraRotations = 3;
    const totalOffset = -(prizeIndex * itemWidth) - (extraRotations * items.length * itemWidth);
    
    // Сбрасываем анимацию
    roulette.style.transition = 'none';
    roulette.style.transform = `translateX(${totalOffset}px)`;
    
    // Даем время на сброс
    setTimeout(() => {
        roulette.style.transition = `transform ${spinDuration/1000}s cubic-bezier(0.17, 0.67, 0.12, 0.99)`;
        roulette.style.transform = `translateX(${-(prizeIndex * itemWidth)}px)`;
    }, 10);
    
    // Обработка результата после анимации
    setTimeout(async () => {
        const prize = items[prizeIndex];
        const prizeType = prize.getAttribute('data-type');
        const prizeValue = prize.getAttribute('data-value');
        
        let message = '';
        
        // Добавляем анимацию выигрыша
        prize.classList.add('pulse');
        setTimeout(() => prize.classList.remove('pulse'), 2000);
        
        // Обработка приза
        switch (prizeType) {
            case 'balance':
                const amount = parseInt(prizeValue);
                userBalance += amount;
                document.getElementById('user-balance').textContent = userBalance;
                message = `🎉 Вы выиграли ${amount} монет!`;
                await supabase.from('users').update({ balance: userBalance }).eq('id', currentUser.id);
                break;
                
            case 'discount':
                localStorage.setItem('activeDiscount', prizeValue);
                message = `🎁 Вы получили скидку ${prizeValue}% на следующий кейс!`;
                break;
                
            case 'item':
                const itemRarity = prizeValue;
                const { data: randomItem } = await supabase
                    .from('items')
                    .select('*')
                    .eq('rarity', itemRarity)
                    .limit(1);
                
                if (randomItem && randomItem.length > 0) {
                    await supabase.from('inventory').insert([{
                        user_id: currentUser.id,
                        item_id: randomItem[0].id,
                        obtained_at: new Date().toISOString()
                    }]);
                    message = `🎁 Вы получили ${getRarityName(itemRarity)} предмет: ${randomItem[0].name}!`;
                    await loadInventory();
                }
                break;
        }
        
        // Записываем получение бонуса
        await supabase.from('daily_bonuses').insert([{
            user_id: currentUser.id,
            type: prizeType,
            value: prizeValue,
            claimed_at: new Date().toISOString()
        }]);
        
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Крутить рулетку';
        showNotification(message);
    }, spinDuration + 100);
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
            
            // Здесь можно добавить фильтрацию по категориям
            // Например, загрузить из БД кейсы определенной категории
        });
    });
}

// Функция для отрисовки кейсов
// Обновленная функция для отрисовки кейсов
function renderCases(cases, filter = 'all') {
    const container = document.querySelector('.cases-grid');
    container.innerHTML = '';
    
    const filteredCases = filter === 'all' 
        ? cases 
        : cases.filter(c => c.rarity === filter);
    
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
                    <div class="items-count">${getRandomItemsCount()} items</div>
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
                    name: el.querySelector('.case-name').textContent,
                    price: parseInt(el.querySelector('.price-value').textContent),
                    image_url: el.querySelector('.case-image').style.backgroundImage.slice(5, -2),
                    items_count: parseInt(el.querySelector('.case-badge').textContent)
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