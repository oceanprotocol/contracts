## `BMath`






### `calcSpotPrice(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 swapFee) → uint256 spotPrice` (public)

********************************************************************************************
// calcSpotPrice                                                                             //
// sP = spotPrice                                                                            //
// bI = tokenBalanceIn                ( bI / wI )         1                                  //
// bO = tokenBalanceOut         sP =  -----------  *  ----------                             //
// wI = tokenWeightIn                 ( bO / wO )     ( 1 - sF )                             //
// wO = tokenWeightOut                                                                       //
// sF = swapFee                                                                              //*********************************************************************************************



### `calcOutGivenIn(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 tokenAmountIn, uint256 swapFee) → uint256 tokenAmountOut` (public)

********************************************************************************************
// calcOutGivenIn                                                                            //
// aO = tokenAmountOut                                                                       //
// bO = tokenBalanceOut                                                                      //
// bI = tokenBalanceIn              /      /            bI             \    (wI / wO) \      //
// aI = tokenAmountIn    aO = bO * |  1 - | --------------------------  | ^            |     //
// wI = tokenWeightIn               \      \ ( bI + ( aI * ( 1 - sF )) /              /      //
// wO = tokenWeightOut                                                                       //
// sF = swapFee                                                                              //*********************************************************************************************



### `calcInGivenOut(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 tokenAmountOut, uint256 swapFee) → uint256 tokenAmountIn` (public)

********************************************************************************************
// calcInGivenOut                                                                            //
// aI = tokenAmountIn                                                                        //
// bO = tokenBalanceOut               /  /     bO      \    (wO / wI)      \                 //
// bI = tokenBalanceIn          bI * |  | ------------  | ^            - 1  |                //
// aO = tokenAmountOut    aI =        \  \ ( bO - aO ) /                   /                 //
// wI = tokenWeightIn           --------------------------------------------                 //
// wO = tokenWeightOut                          ( 1 - sF )                                   //
// sF = swapFee                                                                              //*********************************************************************************************



### `calcPoolOutGivenSingleIn(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 poolSupply, uint256 totalWeight, uint256 tokenAmountIn, uint256 swapFee) → uint256 poolAmountOut` (public)

********************************************************************************************
// calcPoolOutGivenSingleIn                                                                  //
// pAo = poolAmountOut         /                                              \              //
// tAi = tokenAmountIn        ///      /     //    wI \      \\       \     wI \             //
// wI = tokenWeightIn        //| tAi *| 1 - || 1 - --  | * sF || + tBi \    --  \            //
// tW = totalWeight     pAo=||  \      \     \\    tW /      //         | ^ tW   | * pS - pS //
// tBi = tokenBalanceIn      \\  ------------------------------------- /        /            //
// pS = poolSupply            \\                    tBi               /        /             //
// sF = swapFee                \                                              /              //*********************************************************************************************



### `calcSingleInGivenPoolOut(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 poolSupply, uint256 totalWeight, uint256 poolAmountOut, uint256 swapFee) → uint256 tokenAmountIn` (public)

********************************************************************************************
// calcSingleInGivenPoolOut                                                                  //
// tAi = tokenAmountIn              //(pS + pAo)\     /    1    \\                           //
// pS = poolSupply                 || ---------  | ^ | --------- || * bI - bI                //
// pAo = poolAmountOut              \\    pS    /     \(wI / tW)//                           //
// bI = balanceIn          tAi =  --------------------------------------------               //
// wI = weightIn                              /      wI  \                                   //
// tW = totalWeight                          |  1 - ----  |  * sF                            //
// sF = swapFee                               \      tW  /                                   //*********************************************************************************************



### `calcSingleOutGivenPoolIn(uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 poolSupply, uint256 totalWeight, uint256 poolAmountIn, uint256 swapFee) → uint256 tokenAmountOut` (public)

********************************************************************************************
// calcSingleOutGivenPoolIn                                                                  //
// tAo = tokenAmountOut            /      /                                             \\   //
// bO = tokenBalanceOut           /      // pS - (pAi * (1 - eF)) \     /    1    \      \\  //
// pAi = poolAmountIn            | bO - || ----------------------- | ^ | --------- | * b0 || //
// ps = poolSupply                \      \\          pS           /     \(wO / tW)/      //  //
// wI = tokenWeightIn      tAo =   \      \                                             //   //
// tW = totalWeight                    /     /      wO \       \                             //
// sF = swapFee                    *  | 1 - |  1 - ---- | * sF  |                            //
// eF = exitFee                        \     \      tW /       /                             //*********************************************************************************************



### `calcPoolInGivenSingleOut(uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 poolSupply, uint256 totalWeight, uint256 tokenAmountOut, uint256 swapFee) → uint256 poolAmountIn` (public)

********************************************************************************************
// calcPoolInGivenSingleOut                                                                  //
// pAi = poolAmountIn               // /               tAo             \\     / wO \     \   //
// bO = tokenBalanceOut            // | bO - -------------------------- |\   | ---- |     \  //
// tAo = tokenAmountOut      pS - ||   \     1 - ((1 - (tO / tW)) * sF)/  | ^ \ tW /  * pS | //
// ps = poolSupply                 \\ -----------------------------------/                /  //
// wO = tokenWeightOut  pAi =       \\               bO                 /                /   //
// tW = totalWeight           -------------------------------------------------------------  //
// sF = swapFee                                        ( 1 - eF )                            //
// eF = exitFee                                                                              //*********************************************************************************************




