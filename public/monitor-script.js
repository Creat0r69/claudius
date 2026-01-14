/**
 * open-nof1.ai - AI cryptocurrency automated trading system
 * Copyright (C) 2025 195440
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// AI Trading Monitor - uses live API
class TradingMonitor {
    constructor() {
        this.cryptoPrices = new Map();
        this.accountData = null;
        this.equityChart = null;
        this.chartTimeframe = '24'; // Fixed 24 hours
        this.password = null; // Stores validated password
        this.isLoggedIn = false; // Login status
        this.init();
    }

    async init() {
        await this.loadInitialData();
        this.initEquityChart();
        this.initTimeframeSelector();
        this.startDataUpdates();
        this.initTabs();
        this.initChat();
        this.duplicateTicker();
        this.loadGitHubStars(); // Load GitHub stars
        this.initLoginModal(); // Initialize login modal
        this.checkLoginStatus(); // Check login status
    }

    // Load initial data
    async loadInitialData() {
        try {
            await Promise.all([
                this.loadAccountData(),
                this.loadPositionsData(),
                this.loadTradesData(),
                this.loadLogsData(),
                this.loadTickerPrices(),
                this.loadStrategyData()
            ]);
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    }

    // Load GitHub stars
    async loadGitHubStars() {
        try {
            const response = await fetch('https://api.github.com/repos/195440/open-nof1.ai');
            const data = await response.json();
            const starsCount = document.getElementById('stars-count');
            if (starsCount && data.stargazers_count !== undefined) {
                // Format stars (show k over 1000)
                const count = data.stargazers_count;
                starsCount.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count;
            }
        } catch (error) {
            console.error('Failed to load GitHub stars:', error);
            const starsCount = document.getElementById('stars-count');
            if (starsCount) {
                starsCount.textContent = '-';
            }
        }
    }

    // Load account data
    async loadAccountData() {
        try {
            const response = await fetch('/api/account');
            const data = await response.json();
            
            if (data.error) {
                console.error('API error:', data.error);
                return;
            }

            this.accountData = data;
            
            // Use same algorithm as app.js to compute total assets
            // API totalBalance does not include unrealized P&L
            // Displayed total assets include unrealized P&L for real-time accuracy
            const totalBalanceWithPnl = data.totalBalance + data.unrealisedPnl;
            
            // Update total assets
        const accountValueEl = document.getElementById('account-value');
            if (accountValueEl) {
                accountValueEl.textContent = totalBalanceWithPnl.toFixed(2);
            }

            // Update available balance
            const availableBalanceEl = document.getElementById('available-balance');
            if (availableBalanceEl) {
                availableBalanceEl.textContent = data.availableBalance.toFixed(2);
            }

            // Update unrealized P&L (with sign and color)
            const unrealisedPnlEl = document.getElementById('unrealised-pnl');
            if (unrealisedPnlEl) {
                const pnlValue = (data.unrealisedPnl >= 0 ? '+' : '') + data.unrealisedPnl.toFixed(2);
                unrealisedPnlEl.textContent = pnlValue;
                unrealisedPnlEl.className = 'detail-value ' + (data.unrealisedPnl >= 0 ? 'positive' : 'negative');
            }

            // Update P&L (total assets - initial balance)
        const valueChangeEl = document.getElementById('value-change');
        const valuePercentEl = document.getElementById('value-percent');

            if (valueChangeEl && valuePercentEl) {
                // Return % = (total assets incl. unrealized P&L - initial balance) / initial balance * 100
                const totalPnl = totalBalanceWithPnl - data.initialBalance;
                const returnPercent = (totalPnl / data.initialBalance) * 100;
                const isPositive = totalPnl >= 0;
                
                valueChangeEl.textContent = `${isPositive ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}`;
                valuePercentEl.textContent = `(${isPositive ? '+' : ''}${returnPercent.toFixed(2)}%)`;
                
                // Update colors
                valueChangeEl.className = 'change-amount ' + (isPositive ? '' : 'negative');
                valuePercentEl.className = 'change-percent ' + (isPositive ? '' : 'negative');
            }
            
        } catch (error) {
            console.error('Failed to load account data:', error);
        }
    }

    // Load strategy data
    async loadStrategyData() {
        try {
            const response = await fetch('/api/strategy');
            const data = await response.json();
            
            if (data.error) {
                console.error('API error:', data.error);
                return;
            }

            // Update strategy badge
            const strategyBadge = document.getElementById('strategy-badge');
            if (strategyBadge) {
                strategyBadge.textContent = data.strategyName;
                // Remove all strategy class names
                strategyBadge.className = 'strategy-badge-inline';
                // Add current strategy class name
                strategyBadge.classList.add(data.strategy);
            }

            // Update strategy details (single line)
            const strategyInfoInline = document.getElementById('strategy-info-inline');
            if (strategyInfoInline) {
                const protectionMode = data.enableCodeLevelProtection ? 'Code-level' : 'AI';
                strategyInfoInline.textContent = `${data.intervalMinutes} min | ${data.leverageRange} | ${data.positionSizeRange} | ${protectionMode}`;
            }
            
        } catch (error) {
            console.error('Failed to load strategy data:', error);
        }
    }

    // Load positions data
    async loadPositionsData() {
        try {
            const response = await fetch('/api/positions');
            const data = await response.json();
            
            if (data.error) {
                console.error('API error:', data.error);
                return;
            }

            const positionsBody = document.getElementById('positions-body');
            const positionsCardsContainer = document.getElementById('positions-cards-container');
            
            if (!data.positions || data.positions.length === 0) {
                // Update table
                if (positionsBody) {
                    positionsBody.innerHTML = '<tr><td colspan="9" class="empty-state">No open positions</td></tr>';
                }
                // Update small cards
                if (positionsCardsContainer) {
                    positionsCardsContainer.innerHTML = '<div class="positions-cards-empty">No open positions</div>';
                }
                return;
            }

            // Update crypto prices
            data.positions.forEach(pos => {
                this.cryptoPrices.set(pos.symbol, pos.currentPrice);
            });
            this.updateTickerPrices();

            // Update positions table
            if (positionsBody) {
                positionsBody.innerHTML = data.positions.map(pos => {
                    const profitPercent = ((pos.unrealizedPnl / pos.openValue) * 100).toFixed(2);
                    const sideText = pos.side === 'long' ? 'Long' : 'Short';
                    const sideClass = pos.side === 'long' ? 'positive' : 'negative';
                    const leverage = pos.leverage || '-';
                    
                    // Close button - only shown when logged in
                    const closeButtonHtml = this.isLoggedIn 
                        ? `<button class="btn-close-position" onclick="monitor.closePosition('${pos.symbol}')">Close</button>`
                        : '<span style="color: var(--text-dim); font-size: 0.75rem;">Not logged in</span>';
                    
                    return `
                        <tr>
                            <td>${pos.symbol}</td>
                            <td class="${sideClass}">${sideText}</td>
                            <td>${leverage}x</td>
                            <td>$${pos.entryPrice.toFixed(4)}</td>
                            <td>$${pos.openValue.toFixed(2)}</td>
                            <td>$${pos.currentPrice.toFixed(4)}</td>
                            <td class="${pos.unrealizedPnl >= 0 ? 'positive' : 'negative'}">
                                ${pos.unrealizedPnl >= 0 ? '+' : ''}$${pos.unrealizedPnl.toFixed(2)}
                            </td>
                            <td class="${pos.unrealizedPnl >= 0 ? 'positive' : 'negative'}">
                                ${pos.unrealizedPnl >= 0 ? '+' : ''}${profitPercent}%
                            </td>
                            <td class="td-actions">${closeButtonHtml}</td>
                        </tr>
                    `;
                }).join('');
            }

            // Update position cards
            if (positionsCardsContainer) {
                positionsCardsContainer.innerHTML = data.positions.map(pos => {
                    const profitPercent = ((pos.unrealizedPnl / pos.openValue) * 100).toFixed(2);
                    const sideClass = pos.side;
                    const sideText = pos.side === 'long' ? 'Long' : 'Short';
                    const pnlClass = pos.unrealizedPnl >= 0 ? 'positive' : 'negative';
                    const leverage = pos.leverage || '-';
                    
                    return `
                        <div class="position-card ${sideClass} ${pnlClass}">
                            <span class="position-card-symbol">${pos.symbol} ${leverage}x</span>
                            <span class="position-card-pnl ${pnlClass}">
                                ${sideText} ${pos.unrealizedPnl >= 0 ? '+' : ''}$${pos.unrealizedPnl.toFixed(2)} (${pos.unrealizedPnl >= 0 ? '+' : ''}${profitPercent}%)
                            </span>
                        </div>
                    `;
                }).join('');
            }
            
        } catch (error) {
            console.error('Failed to load positions data:', error);
        }
    }

    // Load trades - same layout as index.html
    async loadTradesData() {
        try {
            const response = await fetch('/api/trades?limit=100');
            const data = await response.json();
            
            if (data.error) {
                console.error('API error:', data.error);
                return;
            }

            const tradesBody = document.getElementById('trades-body');
            const countEl = document.getElementById('tradesCount');
            
            if (!data.trades || data.trades.length === 0) {
                if (tradesBody) {
                    tradesBody.innerHTML = '<tr><td colspan="9" class="empty-state">No trades</td></tr>';
                }
                if (countEl) {
                    countEl.textContent = '';
                }
                return;
            }
            
            if (countEl) {
                countEl.textContent = `(${data.trades.length})`;
            }
            
            if (tradesBody) {
                tradesBody.innerHTML = data.trades.map(trade => {
                    const date = new Date(trade.timestamp);
                    const timeStr = date.toLocaleString('en-US', {
                        timeZone: 'Asia/Shanghai',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    
                    // Type display
                    const typeText = trade.type === 'open' ? 'Open' : 'Close';
                    const typeClass = trade.type === 'open' ? 'buy' : 'sell';
                    
                    // Side display
                    const sideText = trade.side === 'long' ? 'Long' : 'Short';
                    const sideClass = trade.side === 'long' ? 'long' : 'short';
                    
                    // P&L display (close trades only)
                    const pnlHtml = trade.type === 'close' && trade.pnl !== null && trade.pnl !== undefined
                        ? `<span class="${trade.pnl >= 0 ? 'profit' : 'loss'}">${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</span>`
                        : '<span class="na">-</span>';
                    
                    return `
                        <tr>
                            <td>${timeStr}</td>
                            <td><span class="symbol">${trade.symbol}</span></td>
                            <td><span class="type ${typeClass}">${typeText}</span></td>
                            <td><span class="side ${sideClass}">${sideText}</span></td>
                            <td>${trade.price.toFixed(2)}</td>
                            <td>${trade.quantity}</td>
                            <td>${trade.leverage}x</td>
                            <td>${trade.fee.toFixed(4)}</td>
                            <td>${pnlHtml}</td>
                        </tr>
                    `;
                }).join('');
            }
            
        } catch (error) {
            console.error('Failed to load trade records:', error);
        }
    }

    // Load AI decision logs - show latest full entry
    async loadLogsData() {
        try {
            const response = await fetch('/api/logs?limit=1');
            const data = await response.json();
            
            if (data.error) {
                console.error('API error:', data.error);
                return;
            }

            const decisionContent = document.getElementById('decision-content');
            const decisionMeta = document.getElementById('decision-meta');
            
            if (data.logs && data.logs.length > 0) {
                const log = data.logs[0]; // Only take latest entry
                
                // Update decision metadata
                if (decisionMeta) {
                    const timestamp = new Date(log.timestamp).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    
                    decisionMeta.innerHTML = `
                        <span class="decision-time">${timestamp}</span>
                        <span class="decision-iteration">#${log.iteration}</span>
                    `;
                }
                
                // Update decision details
                if (decisionContent) {
                    const decision = log.decision || log.actionsTaken || 'No decision content';
                    // Use marked to convert markdown to HTML
                    const htmlContent = marked.parse(decision);
                    
                    decisionContent.innerHTML = `<div class="decision-text markdown-content">${htmlContent}</div>`;
                }
            } else {
                if (decisionContent) {
                    decisionContent.innerHTML = '<p class="no-data">No AI decision records</p>';
                }
                if (decisionMeta) {
                    decisionMeta.innerHTML = '<span class="decision-time">No data</span>';
                }
            }
            
        } catch (error) {
            console.error('Failed to load logs:', error);
            const decisionContent = document.getElementById('decision-content');
            if (decisionContent) {
                decisionContent.innerHTML = `<p class="error">Load failed: ${error.message}</p>`;
            }
        }
    }

    // Load top ticker prices (from API)
    async loadTickerPrices() {
        try {
            const response = await fetch('/api/prices?symbols=BTC,ETH,SOL,BNB,DOGE,XRP');
            const data = await response.json();
            
            if (data.error) {
                console.error('Failed to fetch prices:', data.error);
                return;
            }
            
            // Update price cache
            Object.entries(data.prices).forEach(([symbol, price]) => {
                this.cryptoPrices.set(symbol, price);
            });
            
            // Update display
            this.updateTickerPrices();
        } catch (error) {
            console.error('Failed to load ticker prices:', error);
        }
    }

    // Update ticker prices
    updateTickerPrices() {
        this.cryptoPrices.forEach((price, symbol) => {
                const priceElements = document.querySelectorAll(`[data-symbol="${symbol}"]`);
                priceElements.forEach(el => {
                const decimals = price < 1 ? 4 : 2;
                el.textContent = '$' + price.toFixed(decimals);
            });
        });
    }

    // Start data updates
    startDataUpdates() {
        // Update account and positions every 3s (real-time)
        setInterval(async () => {
            await Promise.all([
                this.loadAccountData(),
                this.loadPositionsData()
            ]);
        }, 3000);

        // Update prices every 10s (real-time)
        setInterval(async () => {
            await this.loadTickerPrices();
        }, 10000);

        // Update trades and logs every 30s
        setInterval(async () => {
            await Promise.all([
                this.loadTradesData(),
                this.loadLogsData()
            ]);
        }, 30000);

        // Update equity chart every 30s
        setInterval(async () => {
            await this.updateEquityChart();
        }, 30000);
    }

    // Duplicate ticker content for seamless scroll
    duplicateTicker() {
        const ticker = document.getElementById('ticker');
        if (ticker) {
            const tickerContent = ticker.innerHTML;
            ticker.innerHTML = tickerContent + tickerContent + tickerContent;
        }
    }

    // Initialize tabs (simplified, single tab)
    initTabs() {
        // Single tab only; no switching needed
    }

    // Initialize chat (removed)
    initChat() {
        // Chat removed
    }

    // Initialize equity chart
    async initEquityChart() {
        const ctx = document.getElementById('equityChart');
        if (!ctx) {
            console.error('Chart canvas element not found');
            return;
        }

        // Load history data
        const historyData = await this.loadEquityHistory();
        
        console.log('Equity history data:', historyData);
        
        if (!historyData || historyData.length === 0) {
            console.log('No history data; chart will display once data is available');
            // Show hint
            const container = ctx.parentElement;
            if (container) {
                const message = document.createElement('div');
                message.className = 'no-data';
                message.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #00cc88; text-align: center;';
                message.innerHTML = 'No history data<br><small style="color: #008866;">The system records account equity every 10 minutes</small>';
                container.appendChild(message);
            }
            return;
        }

        // Create chart
        this.equityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historyData.map(d => {
                    const date = new Date(d.timestamp);
                    return date.toLocaleString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }),
                datasets: [
                    {
                        label: 'Total Assets (USDT)',
                        data: historyData.map(d => parseFloat(d.totalValue.toFixed(2))),
                        borderColor: 'rgb(0, 255, 170)',
                        backgroundColor: 'rgba(0, 255, 170, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#fff',
                            usePointStyle: true,
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += '$' + context.parsed.y;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#9ca3af',
                            maxRotation: 45,
                            minRotation: 0,
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        display: true,
                        position: 'left',
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#9ca3af',
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }

    // Load equity history data
    async loadEquityHistory() {
        try {
            // Fetch all history data
            const response = await fetch(`/api/history`);
            const data = await response.json();
            
            if (data.error) {
                console.error('API error:', data.error);
                return [];
            }
            
            return data.history || [];
        } catch (error) {
            console.error('Failed to load equity history data:', error);
            return [];
        }
    }

    // Update equity chart
    async updateEquityChart() {
        if (!this.equityChart) {
            await this.initEquityChart();
            return;
        }

        const historyData = await this.loadEquityHistory();
        
        if (!historyData || historyData.length === 0) {
            return;
        }

        // Update chart data
        this.equityChart.data.labels = historyData.map(d => {
            const date = new Date(d.timestamp);
            return date.toLocaleString('en-US', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        });
        
        this.equityChart.data.datasets[0].data = historyData.map(d => 
            parseFloat(d.totalValue.toFixed(2))
        );
        
        // Keep points hidden
        this.equityChart.data.datasets[0].pointRadius = 0;
        
        this.equityChart.update('none'); // Update without animation
    }

    // Initialize timeframe selector (switching disabled)
    initTimeframeSelector() {
        // Timeframe fixed to 24h; switching disabled
    }

    // Initialize price color toggle
    initColorSchemeToggle() {
        const toggleBtn = document.getElementById('trend-colors-btn');
        if (toggleBtn) {
            // Load saved color scheme
            this.loadColorScheme();
            
            toggleBtn.addEventListener('click', () => {
                this.toggleColorScheme();
            });
        }
    }

    // Load saved color scheme
    loadColorScheme() {
        const savedScheme = localStorage.getItem('colorScheme');
        const body = document.body;
        
        if (savedScheme === 'reversed') {
            // Apply red-down/green-up mode
            body.classList.add('color-mode-reversed');
            this.updateButtonText('Red down / Green up');
        } else {
            // Apply default red-up/green-down mode
            body.classList.remove('color-mode-reversed');
            this.updateButtonText('Red up / Green down');
        }
    }

    // Toggle price color scheme
    toggleColorScheme() {
        const body = document.body;
        const isReversed = body.classList.contains('color-mode-reversed');
        
        if (isReversed) {
            // Switch to red-up/green-down mode
            body.classList.remove('color-mode-reversed');
            this.updateButtonText('Red up / Green down');
            localStorage.setItem('colorScheme', 'default');
        } else {
            // Switch to red-down/green-up mode
            body.classList.add('color-mode-reversed');
            this.updateButtonText('Red down / Green up');
            localStorage.setItem('colorScheme', 'reversed');
        }
    }

    // Update button text
    updateButtonText(text) {
        const toggleBtn = document.getElementById('trend-colors-btn');
        if (toggleBtn) {
            toggleBtn.textContent = `THEME: ${text}`;
        }
    }

    // Initialize login modal
    initLoginModal() {
        const loginBtn = document.getElementById('login-btn');
        const modal = document.getElementById('login-modal');
        const modalClose = document.getElementById('modal-close');
        const btnCancel = document.getElementById('btn-cancel');
        const btnConfirm = document.getElementById('btn-confirm');
        const passwordInput = document.getElementById('password-input');

        // Login button click
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                if (this.isLoggedIn) {
                    // If logged in, log out
                    this.logout();
                } else {
                    // If logged out, show login modal
                    modal.classList.add('show');
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            });
        }

        // Close modal
        const closeModal = () => {
            modal.classList.remove('show');
            passwordInput.value = '';
        };

        if (modalClose) {
            modalClose.addEventListener('click', closeModal);
        }

        if (btnCancel) {
            btnCancel.addEventListener('click', closeModal);
        }

        // Close when clicking outside modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Confirm login
        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => {
                const password = passwordInput.value.trim();
                if (password) {
                    this.login(password);
                    closeModal();
                } else {
                    this.showToast('Input error', 'Please enter a password', 'warning');
                }
            });
        }

        // Enter to log in
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    btnConfirm.click();
                }
            });
        }
    }

    // Check login status
    checkLoginStatus() {
        const savedPassword = sessionStorage.getItem('close_position_password');
        if (savedPassword) {
            this.password = savedPassword;
            this.isLoggedIn = true;
            this.updateLoginButton();
        }
    }

    // Log in
    login(password) {
        this.password = password;
        this.isLoggedIn = true;
        sessionStorage.setItem('close_position_password', password);
        this.updateLoginButton();
        this.loadPositionsData(); // Reload positions to show close buttons
        this.showToast('Logged in', 'You can now close positions.', 'success');
        console.log('Logged in');
    }

    // Log out
    logout() {
        this.password = null;
        this.isLoggedIn = false;
        sessionStorage.removeItem('close_position_password');
        this.updateLoginButton();
        this.loadPositionsData(); // Reload positions to hide close buttons
        this.showToast('Logged out', 'You are now logged out.', 'info');
        console.log('Logged out');
    }

    // Update login button state
    updateLoginButton() {
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            if (this.isLoggedIn) {
                loginBtn.textContent = 'Log Out';
                loginBtn.classList.add('logged-in');
            } else {
                loginBtn.textContent = 'Log In';
                loginBtn.classList.remove('logged-in');
            }
        }
    }

    // Show toast notification
    showToast(title, message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Icon mapping
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">×</button>
        `;

        container.appendChild(toast);

        // Close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toast);
        });

        // Auto-remove (success 3s, others 5s)
        const timeout = type === 'success' ? 3000 : 5000;
        setTimeout(() => {
            this.removeToast(toast);
        }, timeout);
    }

    // Remove toast
    removeToast(toast) {
        toast.classList.add('toast-removing');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }

    // Close position
    async closePosition(symbol) {
        if (!this.isLoggedIn || !this.password) {
            this.showToast('Not logged in', 'Please log in before closing positions.', 'warning');
            return;
        }

        try {
            // Disable all close buttons
            const buttons = document.querySelectorAll('.btn-close-position');
            buttons.forEach(btn => btn.disabled = true);

            console.log(`Starting close: ${symbol}`);

            const response = await fetch('/api/close-position', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    symbol: symbol,
                    password: this.password,
                }),
            });

            const result = await response.json();

            if (result.success) {
                const pnl = result.data.pnl.toFixed(2);
                const pnlText = result.data.pnl >= 0 ? `+${pnl}` : pnl;
                this.showToast(
                    'Position closed', 
                    `${symbol} closed, P&L: ${pnlText} USDT`, 
                    'success'
                );
                console.log('Position closed:', result);
                
                // Refresh data
                await Promise.all([
                    this.loadAccountData(),
                    this.loadPositionsData(),
                    this.loadTradesData(),
                ]);
            } else {
                // If password is wrong, auto log out
                if (response.status === 403) {
                    this.showToast('Incorrect password', 'Password verification failed. You have been logged out.', 'error');
                    this.logout();
                } else {
                    this.showToast('Close failed', result.message, 'error');
                }
                console.error('Close failed:', result);
            }
        } catch (error) {
            console.error('Close request failed:', error);
            this.showToast('Close failed', error.message, 'error');
        } finally {
            // Re-enable close buttons
            const buttons = document.querySelectorAll('.btn-close-position');
            buttons.forEach(btn => btn.disabled = false);
        }
    }
}

// Global monitor instance for HTML onclick
let monitor;

// Initialize monitor
document.addEventListener('DOMContentLoaded', () => {
    monitor = new TradingMonitor();
    // Initialize price color toggle
    monitor.initColorSchemeToggle();
});

