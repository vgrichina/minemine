window.onload = (function() {
    var DEBUG = false;

    var BLOCK_SIZE = 48,
        BOARD_INSETS = {
            TOP: 0,
            RIGHT: 160,
            BOTTOM: 0,
            LEFT: 160
        },
        BOARD_ROWS = 30,
        BOARD_COLS = 16,
        WIDTH = BOARD_INSETS.LEFT +  BOARD_COLS * BLOCK_SIZE + BOARD_INSETS.RIGHT,
        HEIGHT = 600,
        TWEEN_FRAMES = 15,
        SKY_ROWS = 2,
        MINES_DENSITY = 0.1,
        WIN_BLOCK = -3;

    var MINES = Math.floor(BOARD_COLS * (BOARD_ROWS - SKY_ROWS) * MINES_DENSITY);

    var BOARD = null;

    var ReservedDecoration = {
        MINE: "mine",
        MINE_DEBUG: "mine_debug",
        EXPLODED: "exploded",
        FLAG: "flag",
        FLAG_WRONG: "flag_wrong",
    }

    var BlockType = {
        // Fixed location
        SKY: "sky",
        // Variable location
        DIRT: "dirt",
        STONE: "stone",
        SAND: "sand"
    };

    var BlockDecoration = {
        GRASS: "grass"
    };

    var SFX = {
        WIN: "win",
        EXPLOSION: "explosion",
        FLAG: "flag",
        HIT: "hit",
        JUMP: "jump"
    };

    Crafty.init(WIDTH, HEIGHT, 30);

    // Fix to muted works properly.
    Crafty.audio.old_play = Crafty.audio.play;
    Crafty.audio.play = function(id, repeat) {
        if (Crafty.audio._muted) {
            return;
        }
        Crafty.audio.old_play(id, repeat);
    };

    _.map(ReservedDecoration, function(type, key) {
        var spriteList = {};
        spriteList[type] = [0, 0];
        Crafty.sprite(BLOCK_SIZE, "img/" + type + ".png", spriteList);
    });
    _.map(BlockType, function(type, key) {
        var spriteList = {};
        spriteList[type] = [0, 0];
        spriteList[type + "_bg"] = [1, 0];
        Crafty.sprite(BLOCK_SIZE, "img/" + type + ".png", spriteList);
    });
    _.map(BlockDecoration, function(type, key) {
        var spriteList = {};
        spriteList[type] = [0, 0];
        Crafty.sprite(BLOCK_SIZE, "img/" + type + ".png", spriteList);
    });
    Crafty.sprite(42, "img/player.png", { player: [0, 0] });

    _.map(SFX, function(type, key) {
        var audioList = {};
        audioList[type] = "sfx/" + type + ".wav";
        Crafty.audio.add(audioList);
    });
    Crafty.audio.add({music: "music/music.mp3"});
    Crafty.audio.settings("music", { volume: 0.5 });

    Crafty.c("Decoration", {
        init : function() {
            this.addComponent("2D, Canvas");
        },

        setDecoration : function(decoration) {
            if (this.decoration) {
                this.removeComponent(this.decoration);
            }
            this.addComponent(decoration);
            this.attr({decoration: decoration});
            return this;
        }
    });

    Crafty.c("Block", {
        init: function() {
            this.addComponent("2D, Canvas");
        },

        updateOverlays: function() {
            var oldOverlays = this.overlays;
            var overlays = {};
            var totalDecorations = [].concat(this.decorations);

            if (this.has("Mine")) {
                if (DEBUG) {
                    totalDecorations.push(ReservedDecoration.MINE_DEBUG);
                }
                if (BOARD.isGameOver && this.has("Wall") && !this.has("Flag")) {
                    totalDecorations.push(ReservedDecoration.MINE);
                }
                if (!this.has("Wall")) {
                    totalDecorations.push(ReservedDecoration.MINE);
                    totalDecorations.push(ReservedDecoration.EXPLODED);
                }
            }
            if (this.has("Flag")) {
                if (BOARD.isGameOver && !this.has("Mine")) {
                    totalDecorations.push(ReservedDecoration.FLAG_WRONG);
                } else {
                    totalDecorations.push(ReservedDecoration.FLAG);
                }
            }

            var x = this.x;
            var y = this.y;
            _.map(totalDecorations, function(decoration) {
                if (oldOverlays && oldOverlays[decoration]) {
                    overlays[decoration] = oldOverlays[decoration];
                    delete oldOverlays[decoration];
                } else {
                    overlays[decoration] = Crafty.e("Decoration").setDecoration(decoration).attr({x: x, y: y});
                }
            });
            this.attr({overlays: overlays});
            _.map(oldOverlays, function(overlay, decoration) {
                overlay.destroy();
            });
        },

        destroyOverlays: function() {
            _.map(this.overlays, function(overlay, decoration) {
                overlay.destroy();
            });
        },

        update: function() {
            if (this.has("Wall")) {
                if (this.has(this.type + "_bg")) {
                    this.removeComponent(this.type + "_bg");
                }
                this.addComponent(this.type);
            } else {
                if (this.has(this.type)) {
                    this.removeComponent(this.type);
                }
                this.addComponent(this.type + "_bg");
            }
            this.updateOverlays();
        },

        makeBlock: function(x, y, type, isWall, isMine, decorations) {
            if (isWall) {
                this.addComponent("Wall");
            }
            if (isMine) {
                this.addComponent("Mine");
            }
            this.attr({x: x, y: y, type: type, decorations: decorations});
            this.update();
            return this;
        },

        toggleFlag: function() {
            if (!this.has("Wall")) {
                return;
            }
            if (this.has("Flag")) {
                this.removeComponent("Flag");
            } else {
                this.addComponent("Flag");
            }
            this.updateOverlays();
            BOARD.checkWin();
        },

        harvestBlock: function() {
            if (!this.has("Wall") || this.has("Flag") || this.type == BlockType.STONE) {
                return;
            }
            this.removeComponent("Wall");
            this.update();
            if (this.has("Mine")) {
                BOARD.gameOver(false);
            }
        }
    });

    Crafty.c("Border", {
        init: function() {
            this.addComponent("2D, Canvas, Wall");
        },

        makeBorder: function(side, board) {
            if (!board) {
                board = BOARD;
            }
            if (side == "top") {
                this.attr({x: board.x, y: board.y - BLOCK_SIZE, w: board.w, h: BLOCK_SIZE});
            } else if (side == "right") {
                this.attr({x: board.x + board.w, y: board.y, w: BLOCK_SIZE, h: board.h});
            } else if (side == "bottom") {
                this.attr({x: board.x, y: board.y + board.h, w: board.w, h: BLOCK_SIZE});
            } else if (side == "left") {
                this.attr({x: board.x - BLOCK_SIZE, y: board.y, w: BLOCK_SIZE, h: board.h});
            } else {
                console.error("Wrong border side: <" + side + ">.");
            }
        }
    });

    Crafty.c("Player", {
        init: function() {
            this.addComponent("2D, Canvas, player, Controls, Twoway, Collision, Gravity, SpriteAnimation");
            this.crop(0,0,40,40);
            this.collision();
            this.gravity("Wall");
            this.twoway(4, 9.5);
            this.attr({x: BOARD_INSETS.LEFT, y: BOARD_INSETS.TOP});
            this.crop(0, 0, 42, 34);

            // Digits
            for (var i = 0; i <= 9; i++) {
                this.animate("" + i, i, 0, i);
            }

            this.onHit("Wall", function(hit) {
                var cx = this.x + this.w / 2;
                var cy = this.y + this.h / 2;
                for (var i = 0; i < hit.length; i++) {
                    var obj = hit[i].obj;

                    var rect = {
                        x1: Math.max(this.x, obj.x),
                        y1: Math.max(this.y, obj.y),
                        x2: Math.min(this.x + this.w, obj.x + obj.w),
                        y2: Math.min(this.y + this.h, obj.y + obj.h)
                    };

                    if (rect.x1 > cx) {
                        this.x -= rect.x2 - rect.x1;
                    }
                    if (rect.y1 > cy) {
                        this.y -= rect.y2 - rect.y1;
                    }
                    if (rect.x2 < cx) {
                        this.x += rect.x2 - rect.x1;
                    }
                    if (rect.y2 < cy) {
                        this.y += rect.y2 - rect.y1;
                    }
                }
            });

            this.bind("KeyUp", function(e) {
                if (e.keyCode == Crafty.keys["SPACE"] || e.keyCode == Crafty.keys["ENTER"]) {

                    var cx = this.x + this.w / 2;
                    var cy = this.y + this.h / 2;

                    var block = null;
                    if (this.isDown("DOWN_ARROW")) {
                        block = BOARD.getBlockByCoords(cx, cy + this._h);
                    }
                    if (this.isDown("UP_ARROW")) {
                        block = BOARD.getBlockByCoords(cx, cy - this._h);
                    }
                    if (this.isDown("LEFT_ARROW")) {
                        block = BOARD.getBlockByCoords(cx - this._w, cy);
                    }
                    if (this.isDown("RIGHT_ARROW")) {
                        block = BOARD.getBlockByCoords(cx + this._w, cy);
                    }

                    if (block && block.has("Wall")) {
                        if (e.keyCode == Crafty.keys["SPACE"]) {
                            block.harvestBlock();
                            Crafty.audio.play(SFX.HIT);
                        } else if (e.keyCode == Crafty.keys["ENTER"]) {
                            block.toggleFlag();
                            Crafty.audio.play(SFX.FLAG);
                        }
                    }
                }
            });

            this.bind("KeyDown", function(e) {
                if (e.keyCode == Crafty.keys["UP_ARROW"]) {
                    Crafty.audio.play(SFX.JUMP);
                };
            });


            this.bind("EnterFrame", function() {
                var cx = this.x + this.w / 2;
                var cy = this.y + this.h / 2;

                var blockLeft = Math.floor((this.y + this.h) / BLOCK_SIZE - SKY_ROWS);
                document.getElementById("win-info-count").innerText = blockLeft;
                if (blockLeft == WIN_BLOCK) {
                    BOARD.gameOver(true);
                }

                // Show number of mines
                var d = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
                var count = 0;
                for (var i = 0; i < d.length; i++) {
                    var block = BOARD.getBlockByCoords(cx + d[i][0] * BLOCK_SIZE, cy + d[i][1] * BLOCK_SIZE);
                    if (block && block.has("Mine")) {
                        count++;
                    }
                }
                this.animate(count + "", 1);

                // Scroll viewport if needed
                var vpyDown = this.y - HEIGHT * 3 / 4;
                var vpyUp = this.y - HEIGHT / 4;
                if (vpyDown > 0 && vpyDown < BOARD_ROWS * BLOCK_SIZE - HEIGHT + BLOCK_SIZE && -vpyDown < Crafty.viewport.y) {
                    Crafty.viewport.y = -vpyDown;
                }
                if (vpyUp > 0 && vpyUp < BOARD_ROWS * BLOCK_SIZE - HEIGHT && -vpyUp > Crafty.viewport.y) {
                    Crafty.viewport.y = -vpyUp;
                }
            });
        },
        moveToBlock: function(c, r) {
            this.attr({x: BOARD_INSETS.LEFT + BLOCK_SIZE * c, y: BOARD_INSETS.TOP + BLOCK_SIZE * r});

            return this;
        }
    });


    /**
     * The Game 'Board' Component that includes the game logic.
     */
    Crafty.c("Board", {
        /**
         * Initialisation. Adds components, sets positions, creates the board
         */
        init: function() {
            this.addComponent("2D, Canvas, Color");
            this.x = BOARD_INSETS.LEFT;
            this.y = BOARD_INSETS.TOP;
            this.w = BLOCK_SIZE * BOARD_COLS;
            this.h = BLOCK_SIZE * BOARD_ROWS;
            this.color("#000");

            Crafty.e("Border").makeBorder("right", this);
            Crafty.e("Border").makeBorder("bottom", this);
            Crafty.e("Border").makeBorder("left", this);

            this.bind("KeyUp", function(e) {
                if (e.keyCode == Crafty.keys["ENTER"]) {
                    if (this.isGameOver) {
                        //this.startGame();
                        document.location.reload();
                    }
                }
            });
        },

        _setStatusBarText: function(text) {
            var statusDiv = document.getElementById("status");
            var body = document.getElementsByTagName("body")[0];
            if (!text && statusDiv) {
                body.removeChild(statusDiv);
            }
            if (text) {
                if (!statusDiv) {
                    statusDiv = document.createElement("div");
                    statusDiv.setAttribute("id", "status");
                    body.appendChild(statusDiv);
                }
                statusDiv.innerText = text;
            }
        },

        _clear: function () {
            if (this._board) {
                _.map(this._board, function(column) {
                    _.map(column, function(block) {
                        block.destroyOverlays();
                        block.destroy();
                    }, this);
                }, this);
                delete this._board;
            }
            if (this.player) {
                this.player.destroy();
                delete this.player;
            }
            this._setStatusBarText(null);
        },

        startGame: function() {
            Crafty.audio.play("music", true);
            this._clear();
            this.attr({isGameOver: false});

            var pc = Math.floor(Math.random() * BOARD_COLS),
                pr = BOARD_ROWS - 1;

            var totalBlocks = BOARD_COLS * (BOARD_ROWS - SKY_ROWS);
            var minesCount = MINES;

            // Generate board
            this._board = _.range(BOARD_COLS).map(function(c) {
                return _.range(BOARD_ROWS).map(function(r) {
                    var pos = this._computeBoxPos(c, r);
                    var isWall = false;
                    var isMine = false;
                    var decorations = [];
                    var type;
                    if (r < SKY_ROWS) {
                        type = BlockType.SKY;
                    } else {
                        if (r == SKY_ROWS) {
                            decorations.push(BlockDecoration.GRASS);
                        }

                        var types = [ BlockType.DIRT, BlockType.DIRT, BlockType.SAND, BlockType.SAND, BlockType.STONE ];
                        var index = Math.floor(Math.random() * types.length);
                        type = types[index];
                        isWall = (c != pc || r != pr);
                    }

                    if (minesCount > 0 && isWall && type != BlockType.STONE &&
                            Math.random() < minesCount / totalBlocks) {
                        isMine = true;
                        minesCount--;
                    }
                    totalBlocks--;

                    return Crafty.e("Block").makeBlock(pos.x, pos.y, type, isWall, isMine, decorations);
                }, this);
            }, this);

            this.attr({player: Crafty.e("Player").moveToBlock(pc, pr)});

            Crafty.viewport.y = -BOARD_ROWS * BLOCK_SIZE + HEIGHT;
        },

        _computeBoxPos: function(col, row) {
            return {
                x: this.x + col * BLOCK_SIZE,
                y: this.y + row * BLOCK_SIZE
            };
        },

        getBlock: function(col, row) {
            if (col >= 0 && col < this._board.length && row >= 0 && row < this._board[col].length) {
                return this._board[col][row];
            }

            return null;
        },

        getBlockByCoords: function(x, y) {
            var col = Math.floor((x - this.x) / BLOCK_SIZE);
            var row = Math.floor((y - this.y) / BLOCK_SIZE);
            return this.getBlock(col, row);
        },

        gameOver: function(isWin) {
            this.attr({isGameOver: true});
            _.map(this._board, function(column) {
                _.map(column, function(block) {
                    block.update();
                }, this);
            }, this);
            this.player.destroy();
            delete this.player;
            if (isWin) {
                this._setStatusBarText("You win! Press enter to restart.");
                Crafty.audio.play(SFX.WIN);
            } else {
                this._setStatusBarText("You lose! Press enter to restart.");
                Crafty.audio.play(SFX.EXPLOSION);
            }
        }
    });

    Crafty.scene("Game", function() {
        BOARD = Crafty.e("Board");
        BOARD.startGame();
    });

    // Load assets, then start Game
    Crafty.scene("Loading", function() {
        // Problems with audio in non Chrome browsers.
        _.map(SFX, function (type, key) {
            new Audio("sfx/" + type + ".wav");
        });
        new Audio("music/music.mp3");

        var assets = [];
        var reservedDecorations = _.map(ReservedDecoration, function (type, key) {
            return "img/" + type + ".png";
        });
        assets = assets.concat(reservedDecorations);
        var blockImages = _.map(BlockType, function (type, key) {
            return "img/" + type + ".png";
        });
        assets = assets.concat(blockImages);
        var blockDecorations = _.map(BlockDecoration, function (type, key) {
            return "img/" + type + ".png";
        });
        assets = assets.concat(blockImages);
        assets = assets.concat(["img/player.png"]);
        Crafty.load(assets, function() {
            Crafty.scene("Game");
        });
    });

    // start with the Loading scene
    Crafty.scene("Loading");
});
