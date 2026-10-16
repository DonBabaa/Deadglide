// What DEAD AIR puts on the screen: the round, your points, your ammunition, what you can buy where you stand, the
// red at the edges when you are hurt. Its own layer and its own styles; the game's HUD is hidden while it is up.
import { ZONES } from './station.js';

const CSS = `
#deadair { position: fixed; inset: 0; z-index: 30; pointer-events: none; display: none; font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; color: #e8e2d6; }
#deadair.on { display: block; }
body.deadair #hud, body.deadair #crosshair { display: none !important; }
#deadair .round { position: absolute; left: 34px; bottom: 26px; font: 400 92px/0.9 Anton, Impact, sans-serif; color: #b0110c; text-shadow: 0 0 18px rgba(176, 17, 12, 0.55), 3px 3px 0 #000; letter-spacing: 2px; }
#deadair .round.turning { animation: da-round 2.4s ease-in-out; }
@keyframes da-round { 0% { color: #fff; } 30% { color: #fff; transform: scale(1.12); } 100% { color: #b0110c; transform: none; } }
#deadair .points { position: absolute; right: 34px; bottom: 120px; font: 600 30px 'Barlow Condensed', sans-serif; text-align: right; text-shadow: 2px 2px 0 #000; }
#deadair .points .gain { display: block; font-size: 22px; color: #ffd27a; opacity: 0; transition: opacity 0.4s; }
#deadair .gold { position: absolute; right: 34px; bottom: 172px; font: 600 26px 'Barlow Condensed', sans-serif; color: #ffcf4a; text-shadow: 2px 2px 0 #000, 0 0 12px rgba(255, 190, 40, 0.35); }
#deadair .gold i { display: inline-block; width: 16px; height: 16px; margin-right: 7px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff2b0, #ffc233 45%, #8a5a00); box-shadow: 0 0 6px rgba(255, 190, 40, 0.7); vertical-align: -1px; }
#deadair .gold b { font-weight: 600; font-size: 19px; margin-left: 8px; opacity: 0; transition: opacity 0.4s; }
#deadair.lounge > :not(.round):not(.door) { display: none; }
#deadair.lounge > .cine.on { display: block; }
#deadair.lounge .round { left: 34px; top: 84px; bottom: auto; font-size: 54px; }
#deadair .door { position: absolute; left: 50%; top: 74px; transform: translateX(-50%); font: 600 22px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: #ff5040; text-shadow: 2px 2px 0 #000; display: none; }
#deadair.lounge .door:not(:empty) { display: block; }
#deadair .team { position: absolute; left: 34px; bottom: 130px; font: 600 19px 'Barlow Condensed', sans-serif; letter-spacing: 1px; text-shadow: 1px 1px 0 #000; }
#deadair .team div { display: flex; gap: 12px; align-items: baseline; margin-top: 3px; }
#deadair .team b { min-width: 120px; font-weight: 600; text-transform: uppercase; } #deadair .team span { opacity: 0.75; }
#deadair .team .down b, #deadair .team .down span { color: #ff3a2a; opacity: 1; animation: da-cue 0.9s ease-in-out infinite; } #deadair .team .out { opacity: 0.45; } #deadair .team .safe span { color: #ffb44a; }
#deadair .marker { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); text-align: center; font: 600 15px 'Barlow Condensed', sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #ffcf4a; text-shadow: 1px 1px 0 #000, 0 0 8px rgba(0,0,0,0.8); display: none; white-space: nowrap; }
#deadair .marker i { display: block; width: 13px; height: 13px; margin: 0 auto 4px; background: #ffcf4a; transform: rotate(45deg); box-shadow: 0 0 10px rgba(255, 200, 60, 0.8); }
#deadair .marker.edge i { width: 0; height: 0; background: none; box-shadow: none; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 18px solid #ffcf4a; transform: rotate(var(--a, 0deg)); filter: drop-shadow(0 0 6px rgba(255, 200, 60, 0.8)); }
#deadair .marker small { display: block; font-size: 13px; opacity: 0.85; letter-spacing: 1px; text-transform: none; }
#deadair .drill { position: absolute; left: 50%; bottom: 92px; transform: translate(-50%, 12px); min-width: 380px; max-width: 620px; padding: 14px 22px 12px; background: rgba(8, 10, 14, 0.82); border: 1px solid rgba(154, 230, 255, 0.35); border-left: 4px solid #9ae6ff; text-align: left; opacity: 0; transition: opacity 0.25s, transform 0.25s; pointer-events: none; }
#deadair .drill.on { opacity: 1; transform: translate(-50%, 0); }
#deadair .drill.ok { border-left-color: #7dffb0; }
#deadair .drill .top { display: flex; align-items: center; gap: 14px; }
#deadair .drill kbd { font: 700 17px 'Barlow Condensed', sans-serif; letter-spacing: 1px; color: #0b0d10; background: #e8e2d6; border-radius: 4px; padding: 3px 10px; box-shadow: 0 3px 0 #8a857a; white-space: nowrap; }
#deadair .drill b { font: 700 22px 'Barlow Condensed', sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #f3efe4; }
#deadair .drill .n { margin-left: auto; font: 600 13px 'Barlow Condensed', sans-serif; letter-spacing: 2px; color: #9ae6ff; }
#deadair .drill small { display: block; margin-top: 6px; font: 500 15px 'Barlow Condensed', sans-serif; letter-spacing: 1px; color: #c9c3b6; }
#deadair .drill .bar { margin-top: 9px; height: 3px; background: rgba(255,255,255,0.1); }
#deadair .drill .bar i { display: block; height: 100%; width: 0; background: #9ae6ff; transition: width 0.2s; }
#deadair .drill.ok .bar i { background: #7dffb0; }
#deadair .dmark { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); text-align: center; font: 700 13px 'Barlow Condensed', sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #ffd27a; text-shadow: 1px 1px 0 #000; display: none; pointer-events: none; }
#deadair .dmark i { display: block; width: 14px; height: 14px; margin: 0 auto 4px; border: 2px solid #ffd27a; border-radius: 50%; box-shadow: 0 0 12px rgba(255, 210, 122, 0.9); animation: dmark 1s ease-in-out infinite; }
@keyframes dmark { 50% { transform: scale(1.35); opacity: 0.6; } }
#deadair .cmark { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); text-align: center; font: 600 14px 'Barlow Condensed', sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #9ae6ff; text-shadow: 1px 1px 0 #000, 0 0 8px rgba(0,0,0,0.8); display: none; white-space: nowrap; }
#deadair .cmark i { display: block; width: 11px; height: 11px; margin: 0 auto 4px; border: 2px solid #9ae6ff; transform: rotate(45deg); box-shadow: 0 0 10px rgba(120, 220, 255, 0.8); }
#deadair .cmark small { display: block; font-size: 12px; opacity: 0.85; letter-spacing: 1px; text-transform: none; }
#deadair .pick { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); text-align: center; pointer-events: auto; display: none; }
#deadair .pick.on { display: block; }
#deadair .pick h1 { margin: 0 0 6px; font: 400 64px Anton, Impact, sans-serif; color: #e8291c; letter-spacing: 6px; text-shadow: 4px 4px 0 #000, 0 0 30px rgba(255, 40, 20, 0.6); }
#deadair .pick p { margin: 0 0 18px; font: 600 20px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: rgba(232,226,214,0.8); text-shadow: 2px 2px 0 #000; }
#deadair .pick button { margin: 0 10px; padding: 12px 30px; font: 600 22px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: #e8e2d6; background: rgba(0,0,0,0.65); border: 2px solid #e8e2d6; cursor: pointer; }
#deadair .pick button:hover { background: #e8e2d6; color: #000; }
#deadair .pick button.hard { border-color: #e8291c; color: #ff6a5a; } #deadair .pick button.hard:hover { background: #e8291c; color: #fff; }
#deadair .pick button:disabled { opacity: 0.35; cursor: default; } #deadair .pick button:disabled:hover { background: rgba(0,0,0,0.65); color: #ff6a5a; }
#deadair .pick small { display: block; margin-top: 12px; font: 500 15px 'Barlow Condensed', sans-serif; letter-spacing: 2px; color: rgba(232,226,214,0.7); text-shadow: 1px 1px 0 #000; }
#deadair .pick em.night { display: block; margin-top: 18px; padding: 10px 16px; font: 600 17px 'Barlow Condensed', sans-serif; font-style: normal; letter-spacing: 2px; color: #9ae6ff; border: 1px solid rgba(154, 230, 255, 0.45); background: rgba(0,0,0,0.5); text-shadow: 1px 1px 0 #000; }
#deadair .pick em.night b { color: #e8e2d6; letter-spacing: 3px; }
#deadair .pick em.night:empty { display: none; }
#deadair .logcard { position: absolute; left: 50%; top: 16%; transform: translateX(-50%); min-width: 460px; max-width: 760px; padding: 12px 20px 14px; background: rgba(6, 5, 7, 0.86); border: 1px solid rgba(232, 226, 214, 0.25); border-left: 4px solid #e8291c; display: none; z-index: 4; }
#deadair .logcard.on { display: block; }
#deadair .logcard small { display: block; font: 600 13px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: rgba(232,226,214,0.7); }
#deadair .logcard small i { display: inline-block; width: 9px; height: 9px; margin-right: 8px; border-radius: 50%; background: #e8291c; box-shadow: 0 0 8px #e8291c; animation: recblink 1s steps(2) infinite; }
@keyframes recblink { to { opacity: 0.2; } }
#deadair .logcard p { margin: 6px 0 0; font: 500 24px 'Barlow Condensed', sans-serif; color: #e8e2d6; letter-spacing: 0.5px; min-height: 30px; }
#deadair .pause { position: absolute; inset: 0; display: none; pointer-events: auto; background: rgba(4,4,6,0.74); }
#deadair .pause.on { display: block; z-index: 60; }   /* (over every prompt and bar of the HUD) */
#deadair .pause .box { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); text-align: center; min-width: 340px; }
#deadair .pause h1 { margin: 0 0 4px; font: 400 64px Anton, Impact, sans-serif; color: #e8291c; letter-spacing: 8px; text-shadow: 4px 4px 0 #000, 0 0 30px rgba(255, 40, 20, 0.6); }
#deadair .pause p { margin: 0 0 20px; font: 600 18px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: rgba(232,226,214,0.75); text-shadow: 2px 2px 0 #000; }
#deadair .pause button { display: block; width: 300px; margin: 8px auto; padding: 11px 24px; font: 600 22px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: #e8e2d6; background: rgba(0,0,0,0.65); border: 2px solid #e8e2d6; cursor: pointer; }
#deadair .pause button:hover { background: #e8e2d6; color: #000; }
#deadair .pause button.hard { border-color: #e8291c; color: #ff6a5a; } #deadair .pause button.hard:hover { background: #e8291c; color: #fff; }
#deadair .pause .sure, #deadair .pause .settings { display: none; }
#deadair .pause.asking .menu, #deadair .pause.tuning .menu { display: none; }
#deadair .pause.asking .sure { display: block; } #deadair .pause.tuning .settings { display: block; }
#deadair .pause .sure p { color: #ff6a5a; }
#deadair .pause .settings #audio-controls { margin: 0 auto 16px; font-family: 'Barlow Condensed', sans-serif; }
#deadair .pause .settings #story-toggle { display: none; }
#deadair .pause small { display: block; margin-top: 14px; font: 500 15px 'Barlow Condensed', sans-serif; letter-spacing: 2px; color: rgba(232,226,214,0.6); }
#deadair .struggle { position: absolute; left: 50%; top: calc(50% + 70px); transform: translateX(-50%); text-align: center; display: none; }
#deadair .struggle b { display: block; font: 400 34px Anton, Impact, sans-serif; letter-spacing: 4px; color: #ff3a2a; text-shadow: 3px 3px 0 #000; animation: da-cue 0.5s ease-in-out infinite; }
#deadair .struggle b kbd { display: inline-block; padding: 0 10px; margin-right: 10px; border: 3px solid #ff3a2a; border-radius: 4px; font: inherit; }
#deadair .struggle i { display: block; width: 260px; height: 8px; margin: 8px auto 0; background: rgba(0,0,0,0.6); border: 1px solid rgba(240,232,216,0.6); }
#deadair .struggle i em { display: block; height: 100%; width: 0; background: #ff3a2a; }
#deadair .qte { position: absolute; left: 50%; top: calc(50% + 24px); transform: translateX(-50%); text-align: center; display: none; --c: #9ae6ff; }
#deadair .qte b { display: block; font: 400 34px Anton, Impact, sans-serif; letter-spacing: 4px; color: var(--c); text-shadow: 3px 3px 0 #000; animation: da-cue 0.5s ease-in-out infinite; }
#deadair .qte b kbd { display: inline-block; padding: 0 10px; margin-right: 10px; border: 3px solid var(--c); border-radius: 4px; font: inherit; }
#deadair .qte i { display: block; position: relative; width: 300px; height: 10px; margin: 8px auto 0; background: rgba(0,0,0,0.6); border: 1px solid rgba(240,232,216,0.6); }
#deadair .qte i em { display: block; height: 100%; width: 0; background: var(--c); }
#deadair .qte i u { display: none; position: absolute; top: -5px; width: 4px; height: 20px; margin-left: -2px; background: #fff; box-shadow: 0 0 6px #fff; }
#deadair .qte i s { display: none; position: absolute; top: 0; height: 100%; background: rgba(125, 255, 160, 0.35); }
#deadair .qte.swing i u, #deadair .qte.swing i s { display: block; }
#deadair .eye { position: absolute; left: 50%; top: calc(50% - 62px); transform: translateX(-50%); font: 600 15px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: #9ae6ff; text-shadow: 1px 1px 0 #000, 0 0 10px rgba(154, 230, 255, 0.6); display: none; white-space: nowrap; }
#deadair .eye i { display: inline-block; width: 18px; height: 10px; margin-right: 8px; border: 2px solid #9ae6ff; border-radius: 50%; vertical-align: middle; position: relative; }
#deadair .eye i::after { content: ''; position: absolute; left: 5px; top: 1px; width: 4px; height: 4px; border-radius: 50%; background: #9ae6ff; }
#deadair .qte small { display: block; margin-top: 6px; font: 500 14px 'Barlow Condensed', sans-serif; letter-spacing: 2px; color: rgba(232,226,214,0.75); text-shadow: 1px 1px 0 #000; }
#deadair .revive { position: absolute; left: 50%; top: calc(50% + 60px); transform: translateX(-50%); width: 220px; height: 6px; background: rgba(0,0,0,0.6); border: 1px solid rgba(240,232,216,0.6); display: none; }
#deadair .revive i { display: block; height: 100%; width: 0; background: #7dffa0; }
#deadair .golden { position: absolute; left: 34px; bottom: 200px; font: 400 22px Anton, Impact, sans-serif; letter-spacing: 2px; color: #ffcf4a; text-shadow: 2px 2px 0 #000, 0 0 14px rgba(255, 190, 40, 0.6); display: none; }
#deadair .golden kbd { display: inline-block; margin-right: 8px; padding: 0 7px; border: 2px solid #ffcf4a; border-radius: 3px; font: inherit; }
#deadair .golden.charging { font-size: 17px; color: #c9a649; opacity: 0.85; }
#deadair .golden i { display: block; width: 160px; height: 4px; margin-top: 5px; background: rgba(255, 207, 74, 0.18); box-shadow: 1px 1px 0 #000; }
#deadair .golden i em { display: block; height: 100%; width: 0; background: #ffcf4a; }
#deadair .golden.ready { animation: boofpulse 0.8s ease-in-out infinite alternate; }
@keyframes boofpulse { from { text-shadow: 2px 2px 0 #000, 0 0 8px rgba(255, 190, 40, 0.3); } to { text-shadow: 2px 2px 0 #000, 0 0 28px rgba(255, 200, 60, 1); } }
#deadair .gold-veil { position: absolute; inset: 0; opacity: 0; pointer-events: none; background: radial-gradient(ellipse at center, rgba(255,200,60,0) 55%, rgba(255,170,30,0.28) 85%, rgba(255,140,0,0.5) 100%); transition: opacity 0.4s; }
#deadair .cine { position: absolute; inset: 0; display: none; pointer-events: none; }
#deadair .lbox { position: absolute; inset: 0; pointer-events: none; }   /* (a letterbox that leaves the rest of the HUD up: a QTE played as a cut-in) */
#deadair .lbox i { position: absolute; left: 0; right: 0; height: 0; background: #000; transition: height 0.35s ease; }
#deadair .lbox i:first-child { top: 0; } #deadair .lbox i:last-child { bottom: 0; }
#deadair .lbox.on i { height: 10%; }
#deadair.cinema > :not(.cine) { display: none !important; }
#deadair .cine.on { display: block; }
#deadair .cine .bar { position: absolute; left: 0; right: 0; height: 13%; background: #000; }
#deadair .cine .bar.top { top: 0; } #deadair .cine .bar.bottom { bottom: 0; }
#deadair .glance { position: absolute; inset: 0; opacity: 0; pointer-events: none; background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,230,160,0.0) 0deg 3deg, rgba(255,230,160,0.4) 3deg 3.5deg, rgba(255,230,160,0.0) 3.5deg 6deg); mask: radial-gradient(circle at 50% 50%, transparent 28%, #000 70%); -webkit-mask: radial-gradient(circle at 50% 50%, transparent 28%, #000 70%); }
#deadair .cine .lines { position: absolute; inset: 0; opacity: 0; background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,230,160,0.0) 0deg 3deg, rgba(255,230,160,0.55) 3deg 3.6deg, rgba(255,230,160,0.0) 3.6deg 7deg); -webkit-mask: radial-gradient(circle at center, transparent 22%, #000 60%); mask: radial-gradient(circle at center, transparent 22%, #000 60%); }
#deadair .cine .flash { position: absolute; inset: 0; background: #fff6d8; opacity: 0; }
#deadair .cine .sub { position: absolute; left: 60px; right: 60px; top: calc(64% + 112px); text-align: center; font: 600 23px 'Barlow Condensed', sans-serif; letter-spacing: 5px; text-transform: uppercase; color: #e8e2d6; text-shadow: 2px 2px 0 #000; opacity: 0; }
#deadair .cine .skip { position: absolute; right: 30px; bottom: calc(13% + 14px); font: 600 15px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: rgba(232,226,214,0.55); }
#deadair .cine .title { position: absolute; left: 0; right: 0; top: 64%; text-align: center; font: 400 104px/1 Anton, Impact, sans-serif; color: #ffcf4a; letter-spacing: 6px; text-shadow: 5px 5px 0 #000, 0 0 30px rgba(255, 180, 30, 0.8); opacity: 0; transform: scale(1.3); }
#deadair .hurtdir { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
#deadair .hurtdir i { position: absolute; left: 50%; top: 50%; width: 46vmin; height: 46vmin; margin: -23vmin 0 0 -23vmin; border-radius: 50%; background: conic-gradient(from -40deg, rgba(255,40,20,0) 0deg, rgba(255,40,20,0.85) 40deg, rgba(255,40,20,0) 80deg); -webkit-mask: radial-gradient(circle, transparent 60%, #000 72%, #000 78%, transparent 86%); mask: radial-gradient(circle, transparent 60%, #000 72%, #000 78%, transparent 86%); }
#deadair .banner { position: absolute; left: 50%; top: 20%; transform: translateX(-50%) scale(1); font: 400 64px Anton, Impact, sans-serif; letter-spacing: 6px; text-shadow: 4px 4px 0 #000; opacity: 0; pointer-events: none; }
#deadair .banner.show { animation: da-banner 1.8s ease-out; }
@keyframes da-banner { 0% { opacity: 0; transform: translateX(-50%) scale(1.5); } 12% { opacity: 1; transform: translateX(-50%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; } }
#deadair .whiteout { position: absolute; inset: 0; background: #fff8e6; opacity: 0; pointer-events: none; transition: opacity 0.9s; }
#deadair .ammo.low b { color: #ffb23a; } #deadair .ammo.empty b { color: #ff3a2a; } #deadair .ammo.dry i { color: #ff3a2a; opacity: 1; }
#deadair .cue { position: absolute; left: 50%; top: calc(50% + 34px); transform: translateX(-50%); font: 600 15px 'Barlow Condensed', sans-serif; letter-spacing: 3px; text-transform: uppercase; color: #f0e8d8; text-shadow: 1px 1px 0 #000; opacity: 0.85; white-space: nowrap; }
#deadair .cue kbd { display: inline-block; margin-right: 7px; padding: 0 6px; border: 1px solid rgba(240, 232, 216, 0.7); border-radius: 3px; font: inherit; }
#deadair .cue.warn { color: #ff5040; animation: da-cue 0.9s ease-in-out infinite; }
@keyframes da-cue { 50% { opacity: 0.35; } }
#deadair .ammo { position: absolute; right: 34px; bottom: 30px; text-align: right; text-shadow: 2px 2px 0 #000; }
#deadair .ammo b { font: 400 54px/1 Anton, Impact, sans-serif; letter-spacing: 1px; } #deadair .ammo i { font-style: normal; font-size: 26px; opacity: 0.7; } #deadair .ammo small { display: block; font-size: 17px; letter-spacing: 3px; text-transform: uppercase; opacity: 0.75; }
#deadair .zone { position: absolute; left: 34px; top: 26px; font-size: 18px; letter-spacing: 5px; text-transform: uppercase; opacity: 0.6; text-shadow: 1px 1px 0 #000; }
#deadair .hint { position: absolute; left: 50%; bottom: 22%; transform: translateX(-50%); padding: 8px 18px; font-size: 22px; letter-spacing: 1px; background: rgba(0, 0, 0, 0.55); border: 1px solid rgba(232, 226, 214, 0.25); }
#deadair .hint:empty { display: none; }
#deadair .keys { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; gap: 13px; font: 600 13px 'Barlow Condensed', sans-serif; letter-spacing: 1px; text-transform: uppercase; color: rgba(232, 226, 214, 0.72); text-shadow: 1px 1px 0 #000; white-space: nowrap; }
#deadair .keys kbd { display: inline-block; margin-right: 5px; padding: 1px 5px; border: 1px solid rgba(232, 226, 214, 0.55); border-radius: 3px; font: inherit; color: #e8e2d6; background: rgba(0, 0, 0, 0.5); }
#deadair .keys span.off { display: none; }
#deadair.lounge .keys, #deadair .cine.on ~ .keys, #deadair .pick.on ~ .keys { display: none; }
#deadair .cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
#deadair .cross i { position: absolute; background: rgba(240, 236, 228, 0.85); box-shadow: 0 0 2px #000; }
#deadair .cross i:nth-child(1), #deadair .cross i:nth-child(2) { width: 2px; height: 9px; left: -1px; }
#deadair .cross i:nth-child(3), #deadair .cross i:nth-child(4) { width: 9px; height: 2px; top: -1px; }
#deadair .cross.hit i { background: #ff4a3a; }
#deadair .blood { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(110,0,0,0.55) 75%, rgba(60,0,0,0.92) 100%); transition: opacity 0.25s; }
#deadair .da-card { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); width: min(92vw, 900px); text-align: center; pointer-events: auto; display: none; background: none; border: 0; box-shadow: none; padding: 0; }
#deadair .da-card.on { display: block; }
#deadair .da-card h1 { margin: 0; white-space: nowrap; font: 400 96px/1 Anton, Impact, sans-serif; color: #b0110c; text-shadow: 4px 4px 0 #000; letter-spacing: 3px; }
#deadair .da-card p { margin: 10px 0 22px; font-size: 24px; letter-spacing: 2px; }
#deadair .da-card .crew { margin: 0 auto 18px; width: min(560px, 92%); font: 600 19px 'Barlow Condensed', sans-serif; letter-spacing: 1px; }
#deadair .da-card .crew div { display: flex; gap: 14px; align-items: baseline; padding: 4px 10px; border-bottom: 1px solid rgba(232,226,214,0.12); }
#deadair .da-card .crew b { flex: 1; text-align: left; text-transform: uppercase; } #deadair .da-card .crew span { opacity: 0.8; } #deadair .da-card .crew em { font-style: normal; color: #ffcf4a; font-size: 14px; letter-spacing: 3px; }
#deadair .da-card .crew:empty { display: none; }
#deadair .da-card ol { list-style: none; margin: 0 auto 22px; padding: 0; width: min(420px, 90%); font: 600 19px 'Barlow Condensed', sans-serif; letter-spacing: 1px; text-align: left; }
#deadair .da-card ol li { display: flex; gap: 14px; padding: 3px 10px; border-bottom: 1px solid rgba(232,226,214,0.12); }
#deadair .da-card ol li b { width: 26px; opacity: 0.6; } #deadair .da-card ol li span { flex: 1; text-transform: uppercase; } #deadair .da-card ol li i { font-style: normal; color: #ff5a4a; }
#deadair .da-card ol li.mine { background: rgba(176, 17, 12, 0.35); }
#deadair .da-card button { margin: 0 8px; padding: 10px 26px; font: 600 20px 'Barlow Condensed', sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #e8e2d6; background: rgba(0,0,0,0.6); border: 2px solid #e8e2d6; cursor: pointer; }
#deadair .da-card button:hover { background: #e8e2d6; color: #000; }
#deadair .objective { position: absolute; left: 34px; top: 58px; max-width: 440px; font: 600 17px 'Barlow Condensed', sans-serif; letter-spacing: 1px; text-shadow: 1px 1px 0 #000; display: none; }
#deadair .objective b { display: block; font: 400 27px Anton, Impact, sans-serif; letter-spacing: 3px; color: #ffcf4a; text-shadow: 2px 2px 0 #000; transform-origin: left center; }
#deadair .objective b::before { content: '◆ '; color: #ff5040; }
#deadair .objective span { display: block; opacity: 0.85; font-size: 17px; }
#deadair .objective i { display: none; height: 5px; width: 260px; margin-top: 7px; background: rgba(0,0,0,0.6); border: 1px solid rgba(240,232,216,0.55); }
#deadair .objective i em { display: block; height: 100%; width: 0; background: #ffcf4a; }
#deadair .objective.flash b { animation: da-obj 1.6s ease-out; }
@keyframes da-obj { 0% { color: #fff; transform: scale(1.3); } 60% { color: #fff; } 100% { color: #ffcf4a; transform: none; } }
#deadair .tip { position: absolute; left: 50%; top: 118px; transform: translateX(-50%); padding: 7px 18px; font: 600 17px 'Barlow Condensed', sans-serif; letter-spacing: 1px; color: #f0e8d8; background: rgba(0,0,0,0.62); border-left: 3px solid #ffcf4a; opacity: 0; transition: opacity 0.5s; max-width: 70vw; text-align: center; white-space: nowrap; }
#deadair .tip.show { opacity: 1; }
#deadair .tip small { display: block; font-size: 11px; letter-spacing: 5px; color: #ffcf4a; }
#deadair .line { position: absolute; left: 10%; right: 10%; bottom: 28%; text-align: center; font: 500 24px 'Barlow Condensed', sans-serif; color: #fff; text-shadow: 2px 2px 0 #000, 0 0 10px #000; opacity: 0; transition: opacity 0.4s; }
#deadair .line b, #deadair .cine .say b { color: #ffcf4a; font-weight: 600; margin-right: 10px; }
#deadair .cine .say { position: absolute; left: 10%; right: 10%; bottom: calc(13% + 28px); text-align: center; font: 500 27px 'Barlow Condensed', sans-serif; color: #fff; text-shadow: 2px 2px 0 #000, 0 0 12px #000; opacity: 0; }
#deadair .help { position: absolute; inset: 0; background: rgba(0,0,0,0.84); display: none; padding: 48px 7vw; overflow: auto; font: 500 17px/1.35 'Barlow Condensed', sans-serif; pointer-events: auto; cursor: pointer; }
#deadair .help.on { display: block; }
#deadair.helping > :not(.help) { display: none !important; }
#deadair .loading { position: absolute; inset: 0; background: #050406; display: none; z-index: 5; }
#deadair .loading.on { display: block; }
#deadair .loading h1 { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); margin: 0; font: 400 72px Anton, Impact, sans-serif; color: #e8291c; letter-spacing: 8px; text-shadow: 4px 4px 0 #000, 0 0 30px rgba(255, 40, 20, 0.6); }
#deadair .loading p { position: absolute; left: 50%; top: calc(40% + 56px); transform: translateX(-50%); margin: 0; font: 600 17px 'Barlow Condensed', sans-serif; letter-spacing: 4px; text-transform: uppercase; color: rgba(232,226,214,0.75); white-space: nowrap; }
#deadair .loading i { position: absolute; left: 50%; top: calc(40% + 96px); transform: translateX(-50%); width: 320px; height: 5px; background: rgba(255,255,255,0.08); border: 1px solid rgba(232,226,214,0.35); }
#deadair .loading i em { display: block; height: 100%; width: 0; background: #e8291c; transition: width 0.3s; }
#deadair .help h1 { font: 400 56px Anton, Impact, sans-serif; color: #e8291c; letter-spacing: 4px; margin: 0 0 4px; text-shadow: 3px 3px 0 #000; }
#deadair .help h2 { font: 400 23px Anton, Impact, sans-serif; color: #ffcf4a; letter-spacing: 3px; margin: 18px 0 6px; }
#deadair .help .cols { display: grid; grid-template-columns: 1fr 1.4fr; gap: 0 48px; }
#deadair .help table { border-collapse: collapse; } #deadair .help td { padding: 2px 14px 2px 0; vertical-align: top; } #deadair .help td:first-child { white-space: nowrap; color: #ffcf4a; font-weight: 600; }
#deadair .help kbd { display: inline-block; padding: 0 7px; border: 1px solid rgba(240,232,216,0.7); border-radius: 3px; font: inherit; margin-right: 3px; color: #fff; }
#deadair .help p { opacity: 0.85; margin: 4px 0; }
#deadair .down { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); font: 400 48px Anton, Impact, sans-serif; color: #ff3322; letter-spacing: 4px; text-shadow: 3px 3px 0 #000; display: none; }
`;

const HELP = `<h1>DEAD AIR</h1><p>Shackleton Station, Deck C. Get the power on. Get a signal out. Hold until the lift comes back down. Get everyone into the lift. The rounds never stop; the lift is the only way out.</p>
<div class="cols"><div><h2>Controls</h2><table>
<tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>walk</td></tr>
<tr><td><kbd>Shift</kbd></td><td>sprint (no shooting while you run)</td></tr>
<tr><td><kbd>Space</kbd></td><td>jump; at a crate or a barrel, up onto it or over it</td></tr>
<tr><td>right button</td><td>aim down the sights (first person)</td></tr>
<tr><td>left button</td><td>fire</td></tr>
<tr><td><kbd>F</kbd></td><td>melee: knocks them back, two at a time</td></tr>
<tr><td><kbd>R</kbd></td><td>reload (the shotgun one shell at a time; firing stops it)</td></tr>
<tr><td><kbd>Q</kbd> <kbd>1</kbd> <kbd>2</kbd></td><td>swap between your two guns</td></tr>
<tr><td><kbd>E</kbd></td><td>buy, open, use; hold by a friend to get them up</td></tr>
<tr><td><kbd>G</kbd></td><td>the Golden BOOF, once 25 kills have charged it (story finishers)</td></tr>
<tr><td><kbd>H</kbd> <kbd>Tab</kbd></td><td>this card</td></tr>
<tr><td><kbd>Esc</kbd></td><td>pause; again to leave</td></tr>
</table></div><div><h2>How it works</h2><table>
<tr><td>Points</td><td>hit 10 · kill 60 · headshot 100. They open doors and buy guns and ammo.</td></tr>
<tr><td>Rounds</td><td>never end. Most of them run; sprinters and crawlers from round 3; the Warden every fifth round (500 bounty).</td></tr>
<tr><td>They come</td><td>through the broken walls, lit red. They hear shots. Walkers 1.2 m/s, runners 3.4, sprinters 5.5, crawlers low.</td></tr>
<tr><td>Doors</td><td>Lab 2 750 · Med Bay 1000 · Reactor 1250. Open once, open for good.</td></tr>
<tr><td>Wall guns</td><td>MK4 Rifle 1000 (the Spine) · Trench Gun 1200 (the Med Bay). Ammo for a gun you carry: half price.</td></tr>
<tr><td>The crate</td><td>in the Reactor, 950: rolls a Hand Cannon, a Longshot, the rifle or the shotgun. 9 seconds to take it.</td></tr>
<tr><td>Gold</td><td>drops off kills. It only spends in the Crew Lounge.</td></tr>
<tr><td>Crew Lounge</td><td>behind the Med Bay, 2000 to unseal. Safe. Blackjack, roulette and slots for upgrades; the drinks are perks; three skulls on the slots gild a gun.</td></tr>
<tr><td>Down</td><td>30 seconds to bleed out; shoot from the floor; a friend holds E to get you up. Everyone down: it is over.</td></tr>
<tr><td>Pickups</td><td>MAX AMMO fills every gun · NUKE kills everything alive and pays everyone 400.</td></tr>
<tr><td>Golden BOOF</td><td>Every 25 kills charge it (the meter, bottom left). G: Kirky hits the boof, and for 30 seconds: triple damage, free ammo, double points. Story finishers only.</td></tr>
<tr><td>Screamers</td><td>from round 4: thin, yellow, and they call. Every one of them within earshot comes, and more through the walls. 100 extra for the kill.</td></tr>
<tr><td>Nightmare</td><td>unlocked by getting out once: a third more of them, tougher, no getting better, lights out from round 2, more grabs.</td></tr>
<tr><td>T</td><td>dance. They are watching.</td></tr>
</table></div></div><p>Click, or H, to close</p>`;

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createDeadHud() {
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
  const root = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'deadair' }));
  root.innerHTML = `<div class="blood"></div><div class="zone"></div><div class="cross"><i style="top:-15px"></i><i style="top:6px"></i><i style="left:-15px"></i><i style="left:6px"></i></div>
    <div class="round"></div><div class="points"><span class="gain"></span><span class="total">0</span></div>
    <div class="gold"><i></i><span>0</span><b></b></div><div class="door"></div><div class="ammo"><small class="gun"></small><b class="mag">0</b><i class="spare"> / 0</i></div><div class="hint"></div><div class="cue"></div><div class="team"></div><div class="golden"></div><div class="gold-veil"></div><div class="objective"><b></b><span></span><i><em></em></i></div><div class="tip"><small>TIP</small><span></span></div><div class="line"></div><div class="cine"><div class="say"></div><div class="lines"></div><div class="flash"></div><div class="bar top"></div><div class="bar bottom"></div><div class="title"></div><div class="sub"></div><div class="skip"></div></div><div class="revive"><i></i></div><div class="marker"><i></i><span></span><small></small></div><div class="cmark"><i></i><span>Mystery crate</span><small></small></div><div class="pick"><h1>DEAD AIR</h1><p>How bad is it down there?</p><button type="button" data-d="0">Normal</button><button type="button" class="hard" data-d="1">Nightmare</button><small></small><em class="night"></em></div><div class="logcard"><small><i></i>LOG  ·  <b></b></small><p></p></div><div class="pause"><div class="box"><h1>PAUSED</h1><p>The station waits</p><div class="menu"><button type="button" data-p="resume">Resume</button><button type="button" data-p="controls">Controls</button><button type="button" data-p="settings">Settings</button><button type="button" class="hard" data-p="leave">Leave the station</button></div><div class="settings"><button type="button" data-p="back">Back</button></div><div class="sure"><p>Leave? This run is lost.</p><button type="button" class="hard" data-p="yes">Leave</button><button type="button" data-p="back">Stay</button></div><small>Esc, or a click on the game: back in</small></div></div><div class="struggle"><b><kbd>F</kbd>THROW IT OFF</b><i><em></em></i></div><div class="qte"><b><kbd></kbd><span></span></b><i><em></em><s></s><u></u></i><small></small></div><div class="eye"><i></i><span></span></div><div class="glance"></div><div class="drill"><div class="top"><kbd></kbd><b></b><span class="n"></span></div><small></small><div class="bar"><i></i></div></div><div class="dmark"><i></i><span></span></div><div class="hurtdir"><i></i></div><div class="whiteout"></div><div class="banner"></div><div class="down"></div><div class="keys"><span><kbd>WASD</kbd>move</span><span><kbd>Shift</kbd>sprint</span><span><kbd>Space</kbd>jump · vault</span><span><kbd>RMB</kbd>aim</span><span><kbd>LMB</kbd>fire</span><span><kbd>F</kbd>melee</span><span><kbd>R</kbd>reload</span><span><kbd>Q</kbd>swap</span><span><kbd>E</kbd>use · buy</span><span class="g off"><kbd>G</kbd>boof</span><span><kbd>T</kbd>dance</span><span><kbd>H</kbd>help</span><span><kbd>Esc</kbd>menu</span></div>
    <div class="da-card"><h1></h1><p></p><div class="crew"></div><ol></ol><button type="button" data-act="again">Again</button><button type="button" data-act="leave">Leave</button></div><div class="help">${HELP}</div><div class="loading"><h1>DEAD AIR</h1><p></p><i><em></em></i></div>`;
  root.querySelector('.help').onclick = (e) => { e.stopPropagation(); root.querySelector('.help').classList.remove('on'); root.classList.remove('helping'); };
  const $ = (s) => root.querySelector(s);
  const said = {};
  const set = (key, el, text) => { if (said[key] !== text) { said[key] = text; el.textContent = text; } };
  let gainTimer = 0, goldTimer = 0, tipTimer = 0, settingsHome = null, logTyper = 0;
  return {
    root,
    show(on) { root.classList.toggle('on', on); document.body.classList.toggle('deadair', on); },
    zone(letter) { set('zone', $('.zone'), letter ? ZONES[letter]?.name || '' : ''); },
    hint(text) { set('hint', $('.hint'), text || ''); },
    round(n, turning = false) { set('round', $('.round'), n ? String(n) : ''); if (turning) { const el = $('.round'); el.classList.remove('turning'); void el.offsetWidth; el.classList.add('turning'); } },
    points(total, gain = 0) {
      set('points', $('.points .total'), total.toLocaleString());
      if (gain) { const g = $('.points .gain'); g.textContent = `+${gain}`; g.style.opacity = 1; clearTimeout(gainTimer); gainTimer = setTimeout(() => { g.style.opacity = 0; }, 700); }
    },
    gold(total, gain = 0) {
      set('gold', $('.gold span'), Math.floor(total).toLocaleString());
      if (gain) { const g = $('.gold b'); g.textContent = `+${gain}`; g.style.opacity = 1; clearTimeout(goldTimer); goldTimer = setTimeout(() => { g.style.opacity = 0; }, 700); }
    },
    // In the lounge: only the round, and how many are at the airlock.
    lounge(on, door = '') { root.classList.toggle('lounge', on); set('door', $('.door'), on ? door : ''); },
    // cap: a full magazine; reloading: one is going on. Low: amber, and R offered under the crosshair; empty: red.
    // The others: [{ name, points, downed, out, safe, bleed }] (empty: on your own).
    team(list) {
      const html = list.map((o) => `<div class="${o.downed && !o.out ? 'down' : o.out ? 'out' : o.safe ? 'safe' : ''}"><b>${esc(o.name)}</b><span>${o.out ? 'bled out' : o.downed ? `DOWN ${Math.ceil(o.bleed)}s` : o.safe ? 'in the lounge' : Math.floor(o.points).toLocaleString()}</span></div>`).join('');
      if (said.team !== html) { said.team = html; $('.team').innerHTML = html; }
    },
    // Golden Hour: ready (null: not yours to have), or going (seconds left).
    // charge: 0..1 of the way to the next one (-1: not yours to have), out of `need` kills.
    golden(ready, left = 0, charge = -1, need = 25) {
      const g = $('.golden');
      const text = left > 0 ? `GOLDEN HOUR  ${Math.ceil(left)}` : ready ? '<kbd>G</kbd>GOLDEN BOOF  ·  READY' : charge >= 0 ? `GOLDEN BOOF  ${Math.round(charge * need)} / ${need}<i><em></em></i>` : '';
      if (said.golden !== text) { said.golden = text; g.innerHTML = text; g.style.display = text ? 'block' : 'none'; g.classList.toggle('ready', !!ready && left <= 0); g.classList.toggle('charging', !ready && left <= 0 && charge >= 0); }
      const bar = g.querySelector('em'); if (bar) bar.style.width = `${Math.round(Math.max(0, charge) * 100)}%`;
      $('.gold-veil').style.opacity = left > 0 ? 1 : 0;
    },
    // The glance: speed lines over the game while the view is pulled toward something (0: none).
    glance(k) { $('.glance').style.opacity = Math.max(0, Math.min(1, k)); },
    // A cut-in: on (bars), lines (0..1), flash (0..1), title (text, and 0..1 how far in).
    // The objective, top left: what to do, where it is, and how far along it is (k < 0: no bar). flash: it just changed.
    objective(title, detail = '', k = -1, flash = false) {
      const o = $('.objective');
      set('objT', o.querySelector('b'), title); set('objD', o.querySelector('span'), detail);
      const bar = o.querySelector('i'); bar.style.display = k >= 0 ? 'block' : 'none'; if (k >= 0) bar.firstChild.style.width = `${Math.round(k * 100)}%`;
      if (flash && title) { o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash'); }
      o.style.display = title ? 'block' : 'none';
    },
    // A tip, for a few seconds.
    tip(text) { const t = $('.tip'); t.lastChild.textContent = text; t.classList.add('show'); clearTimeout(tipTimer); tipTimer = setTimeout(() => t.classList.remove('show'), 8500); },
    // A recorder playing: REC, the day and the name, the words typing out; null hides it.
    log(day, who = '', text = '') {
      const c = $('.logcard');
      clearInterval(logTyper);
      if (day == null) { c.classList.remove('on'); return; }
      c.querySelector('b').textContent = `DAY ${day}  ·  ${who}`;
      const p = c.querySelector('p'); p.textContent = '';
      c.classList.add('on');
      let n = 0;
      logTyper = setInterval(() => { n++; p.textContent = text.slice(0, n); if (n >= text.length) clearInterval(logTyper); }, 38);
    },
    // The controls along the bottom: G only for whoever has the BOOF.
    // The bay drill: a step (key, what, a note, n of N, 0..1 how far, done), or null (off).
    drill(step) {
      const d = $('.drill');
      if (!step) { d.classList.remove('on', 'ok'); return; }
      d.querySelector('kbd').textContent = step.key; d.querySelector('b').textContent = step.text;
      d.querySelector('small').textContent = step.note || ''; d.querySelector('.n').textContent = `${step.n} / ${step.of}`;
      d.querySelector('.bar i').style.width = `${Math.round(Math.min(1, step.k || 0) * 100)}%`;
      d.classList.add('on'); d.classList.toggle('ok', !!step.done);
    },
    // Its marker: on screen at x, y (pixels) with a word, or hidden (null).
    dmarker(x, y, text = '') { const m = $('.dmark'); if (x == null) { m.style.display = 'none'; return; } m.style.display = 'block'; m.style.left = `${x}px`; m.style.top = `${y}px`; m.querySelector('span').textContent = text; },
    keys({ golden = false } = {}) { $('.keys .g').classList.toggle('off', !golden); },
    // The pause menu (Esc let the pointer go). settings: the game's own settings panel (#audio-controls), borrowed
    // into the menu while it is up and put back where it came from after. Buttons: onResume, onControls, onLeave.
    pause(on, { settings = null, onResume = null, onControls = null, onLeave = null } = {}) {
      const p = $('.pause');
      if (on && settings && !settingsHome) { settingsHome = { el: settings, parent: settings.parentNode, next: settings.nextSibling }; p.querySelector('.settings').prepend(settings); }
      if (!on && settingsHome) { settingsHome.parent.insertBefore(settingsHome.el, settingsHome.next); settingsHome = null; }
      p.classList.toggle('on', on); p.classList.remove('asking', 'tuning');
      p.onclick = (e) => {
        const b = e.target.closest('button[data-p]'); if (!b) return;
        e.stopPropagation();
        const what = b.dataset.p;
        if (what === 'resume') onResume?.();
        else if (what === 'controls') onControls?.();
        else if (what === 'settings') p.classList.add('tuning');
        else if (what === 'leave') p.classList.add('asking');
        else if (what === 'back') p.classList.remove('asking', 'tuning');
        else if (what === 'yes') onLeave?.();
      };
    },
    get paused() { return $('.pause').classList.contains('on'); },
    get picking() { return $('.pick').classList.contains('on'); },
    // The help card: on, off, or (nothing said) the other way round. Says which.
    help(on = null) { const h = $('.help'); const want = on == null ? !h.classList.contains('on') : on; h.classList.toggle('on', want); root.classList.toggle('helping', want); return want; },
    // The loading screen: what is being got ready, and how far along (null: done, gone).
    loading(text, k = 0) { const l = $('.loading'); l.classList.toggle('on', text != null); if (text != null) { l.querySelector('p').textContent = text; l.querySelector('em').style.width = `${Math.round(k * 100)}%`; } },
    // Someone says something (out in the game; the cut-ins have their own line).
    say(who, line) { const l = $('.line'); const text = line ? (who ? `<b>${esc(who)}</b>${esc(line)}` : esc(line)) : ''; if (l.dataset.t !== text) { l.dataset.t = text; l.innerHTML = text; } l.style.opacity = text ? 1 : 0; },
    letterbox(on) { let l = root.querySelector('.lbox'); if (!l) { l = document.createElement('div'); l.className = 'lbox'; l.innerHTML = '<i></i><i></i>'; root.prepend(l); } l.classList.toggle('on', !!on); },
    cine(on, lines = 0, flash = 0, title = '', k = 0, sub = '', skip = '', say = null) {
      const c = $('.cine');
      c.classList.toggle('on', on);
      root.classList.toggle('cinema', on);
      if (!on) return;
      const Y = c.querySelector('.say'), text = say ? (say[0] ? `<b>${esc(say[0])}</b>${esc(say[1])}` : esc(say[1])) : '';
      if (Y.dataset.t !== text) { Y.dataset.t = text; Y.innerHTML = text; }
      Y.style.opacity = text ? 1 : 0;
      const S = c.querySelector('.sub');
      if (S.textContent !== sub) S.textContent = sub;
      S.style.opacity = sub ? Math.min(1, k * 2) : 0;
      const K = c.querySelector('.skip');
      if (K.textContent !== skip) K.textContent = skip;
      c.querySelector('.lines').style.opacity = lines;
      c.querySelector('.flash').style.opacity = flash;
      const t = c.querySelector('.title');
      if (t.textContent !== title) t.textContent = title;
      t.style.opacity = title ? Math.min(1, k * 4) : 0;
      t.style.transform = `scale(${1 + 0.3 * Math.max(0, 1 - k * 5)})`;
      t.style.color = title === 'DEAD AIR' ? '#e8291c' : '#ffcf4a';
      t.style.textShadow = title === 'DEAD AIR' ? '5px 5px 0 #000, 0 0 34px rgba(255, 40, 20, 0.85)' : '';
    },
    // A word across the screen for a moment (MAX AMMO, NUKE), in a colour.
    banner(text, colour = 0xe8e2d6) {
      const b = $('.banner');
      b.textContent = text; b.style.color = `#${colour.toString(16).padStart(6, '0')}`;
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    },
    // The screen gone white (a nuke), fading back: k = 1 now, then 0.
    whiteout(k) { const w = $('.whiteout'); w.style.transition = k ? 'none' : 'opacity 0.9s'; w.style.opacity = k; if (k) setTimeout(() => { w.style.transition = 'opacity 0.9s'; w.style.opacity = 0; }, 60); },
    // Hit from a direction: bearing (radians, 0 = ahead, + = to your left), and how strong (0..1; 0 hides it).
    hurtFrom(bearing, k) { const h = $('.hurtdir'); h.style.opacity = k; if (k > 0) h.firstChild.style.transform = `rotate(${-bearing}rad)`; },
    // The objective, in the world: at (x, y) on the screen; or (edge) an arrow at the edge turned (angle, radians, 0 = up) toward it. null hides it.
    // The crate's marker (cyan, only while it is in view).
    cmarker(x, y, detail = '') {
      const m = $('.cmark');
      if (x == null) { m.style.display = 'none'; return; }
      m.style.display = 'block';
      m.style.left = `${Math.round(x)}px`; m.style.top = `${Math.round(y)}px`;
      set('cmarkD', m.querySelector('small'), detail);
    },
    marker(x, y, text = '', detail = '', edge = false, angle = 0) {
      const m = $('.marker');
      if (x == null) { m.style.display = 'none'; return; }
      m.style.display = 'block';
      m.style.left = `${Math.round(x)}px`; m.style.top = `${Math.round(y)}px`;
      m.classList.toggle('edge', edge);
      m.style.setProperty('--a', `${Math.round(angle * 180 / Math.PI)}deg`);
      set('markT', m.querySelector('span'), text); set('markD', m.querySelector('small'), detail);
    },
    // The choice at the start. on: show it; unlocked: Nightmare can be picked; waiting: a guest, the host is choosing.
    pick(on, { unlocked = false, waiting = false, onPick = null, night = null } = {}) {
      const p = $('.pick');
      p.classList.toggle('on', on);
      if (!on) return;
      p.querySelector('em.night').innerHTML = night?.name ? `TONIGHT  ·  <b>${night.name}</b>  ·  ${night.blurb}` : '';
      const hard = p.querySelector('button.hard');
      hard.disabled = !unlocked || waiting;
      for (const b of p.querySelectorAll('button')) { b.style.display = waiting ? 'none' : ''; b.onclick = (e) => { e.stopPropagation(); onPick?.(+b.dataset.d); }; }
      p.querySelector('small').textContent = waiting ? 'The host is choosing...' : unlocked ? 'Nightmare: more of them, tougher, no getting better, the lights go early, they grab more.' : 'Nightmare unlocks when you get out once.';
    },
    // The stalker, under somebody's eyes: whose. null: nobody's (hidden).
    eye(who) { const e = $('.eye'); if (!who) { e.style.display = 'none'; return; } e.style.display = 'block'; e.querySelector('span').textContent = `EYES ON IT  ·  ${who}`; },
    // A QTE: key and word, how far (0..1), a colour; swing: { at (0..1: the marker), zone: [a, b] (the green) } for the timing ones; note: a line under.
    qte(key, label = '', k = 0, colour = '#9ae6ff', swing = null, note = '') {
      const q = $('.qte');
      if (key == null) { q.style.display = 'none'; return; }
      q.style.display = 'block'; q.style.setProperty('--c', colour);
      q.querySelector('kbd').textContent = key; q.querySelector('span').textContent = label;
      q.querySelector('em').style.width = `${Math.round(Math.max(0, Math.min(1, k)) * 100)}%`;
      q.classList.toggle('swing', !!swing);
      if (swing) { q.querySelector('u').style.left = `${Math.round(swing.at * 100)}%`; const z = q.querySelector('s'); z.style.left = `${Math.round(swing.zone[0] * 100)}%`; z.style.width = `${Math.round((swing.zone[1] - swing.zone[0]) * 100)}%`; }
      q.querySelector('small').textContent = note;
    },
    // Grabbed: how near to throwing it off (0..1), or null.
    struggle(k) { const s = $('.struggle'); s.style.display = k == null ? 'none' : 'block'; if (k != null) s.querySelector('em').style.width = `${Math.round(k * 100)}%`; },
    // Getting a friend up: how far (0..1), or null.
    revive(k) { const r = $('.revive'); r.style.display = k == null ? 'none' : 'block'; if (k != null) r.firstChild.style.width = `${Math.round(k * 100)}%`; },
    ammo(name, mag, spare, cap = 0, reloading = false) {
      set('gun', $('.ammo .gun'), name); set('mag', $('.ammo .mag'), String(mag)); set('spare', $('.ammo .spare'), ` / ${spare === Infinity ? '∞' : spare}`);
      const a = $('.ammo'), low = cap && mag > 0 && mag <= Math.max(1, Math.floor(cap * 0.25));
      a.classList.toggle('low', !!low); a.classList.toggle('empty', mag === 0); a.classList.toggle('dry', spare === 0);
      const cue = reloading ? 'Reloading' : mag === 0 && spare === 0 ? 'No ammo' : (low || mag === 0) && spare > 0 ? '<kbd>R</kbd>Reload' : '';
      const c = $('.cue');
      if (said.cue !== cue) { said.cue = cue; c.innerHTML = cue; c.classList.toggle('warn', mag === 0 && !reloading); }
    },
    cross(spread, aiming, hit) { const c = $('.cross'); c.style.opacity = aiming ? 0.35 : 1; c.style.transform = `scale(${1 + spread * 0.6})`; c.classList.toggle('hit', !!hit); },
    blood(k) { $('.blood').style.opacity = Math.max(0, Math.min(1, k)); },
    down(text) { const d = $('.down'); d.style.display = text ? 'block' : 'none'; if (text) set('downText', d, text); },
    // buttons: which to show (['again', 'leave'] by default; a guest in a party gets only 'leave', the host decides)
    // rows: the board (DEAD AIR's best: [{ name, wave }]), mine: your name on it
    card(title, line, onPick, buttons = ['again', 'leave'], rows = null, mine = '', crew = null) {
      const c = $('.da-card');
      if (!title) { c.classList.remove('on'); return; }
      // (the crew: who killed what, who got whom up; the one who did most of the killing is the MVP)
      const best = crew && crew.length > 1 ? Math.max(...crew.map((p) => p.kills)) : -1;
      $('.da-card .crew').innerHTML = crew && crew.length > 1 ? crew.map((p) => `<div><b>${esc(p.name)}</b><span>${p.kills} killed · ${p.heads} through the head · ${p.revives} got up</span>${p.kills === best && best > 0 ? '<em>MVP</em>' : ''}</div>`).join('') : '';
      $('.da-card ol').innerHTML = (rows || []).slice(0, 5).map((r, i) => `<li class="${mine && r.name.toLowerCase() === mine.toLowerCase() ? 'mine' : ''}"><b>${i + 1}</b><span>${esc(r.name)}</span><i>round ${r.wave}</i></li>`).join('');
      for (const b of c.querySelectorAll('button')) b.style.display = buttons.includes(b.dataset.act) ? '' : 'none';
      $('.da-card h1').textContent = title;
      $('.da-card p').textContent = line;
      c.classList.add('on');
      for (const b of c.querySelectorAll('button')) b.onclick = (e) => { e.stopPropagation(); onPick(b.dataset.act); };
    },
  };
}
